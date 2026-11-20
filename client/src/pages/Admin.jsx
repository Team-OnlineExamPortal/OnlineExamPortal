import { useEffect, useState } from 'react';
import { adminApi } from '../api';
import { useAuth } from '../auth';
import Shell from '../components/Shell';
import './Admin.css';

const emptyQuestion = { text: '', category: '', options: ['', ''], correctOption: 0 };
const emptyExam = { title: '', category: '', durationMinutes: 30, questionCount: 1, startTime: '', endTime: '', negativeMarking: false };
const keyFor = (item) => item._id || item.id;

export default function Admin() {
  const { token } = useAuth();
  const [tab, setTab] = useState('questions');
  const [questions, setQuestions] = useState([]);
  const [exams, setExams] = useState([]);
  const [students, setStudents] = useState([]);
  const [question, setQuestion] = useState(emptyQuestion);
  const [editingId, setEditingId] = useState(null);
  const [exam, setExam] = useState(emptyExam);
  const [group, setGroup] = useState('exams');
  const [reportId, setReportId] = useState('');
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function refresh() {
    const [bank, schedules, people] = await Promise.all([
      adminApi.questions(token), adminApi.exams(token), adminApi.students(token),
    ]);
    setQuestions(bank); setExams(schedules); setStudents(people);
  }
  useEffect(() => {
    refresh().catch((err) => setError(err.message)).finally(() => setLoading(false));
  }, [token]);

  async function perform(operation) {
    setBusy(true); setError(''); setNotice('');
    try { await operation(); }
    catch (err) { setError(err.message || 'The request could not be completed.'); }
    finally { setBusy(false); }
  }

  function saveQuestion(event) {
    event.preventDefault();
    perform(async () => {
      await adminApi.saveQuestion(editingId, question, token);
      setQuestion(emptyQuestion); setEditingId(null);
      await refresh(); setNotice('Question saved.');
    });
  }
  function createExam(event) {
    event.preventDefault();
    perform(async () => {
      await adminApi.createExam({
        ...exam, startTime: new Date(exam.startTime).toISOString(), endTime: new Date(exam.endTime).toISOString(),
      }, token);
      setExam(emptyExam); await refresh(); setNotice('Exam scheduled.');
    });
  }
  function showReport(event) {
    event.preventDefault();
    perform(async () => {
      setReport(null);
      setReport(await adminApi.report(group, reportId, token));
    });
  }
  function changeOption(index, value) {
    setQuestion({ ...question, options: question.options.map((option, i) => i === index ? value : option) });
  }

  return <Shell>
    <h1 className="page-title">Administration</h1>
    <div className="admin-tabs" role="tablist" aria-label="Administration sections">
      {[['questions', 'Question bank'], ['exams', 'Exam scheduling'], ['reports', 'Reports']].map(([id, label]) =>
        <button key={id} role="tab" aria-selected={tab === id} onClick={() => { setTab(id); setError(''); setNotice(''); }}>{label}</button>)}
    </div>
    {error && <div className="notice error" role="alert">{error}</div>}
    {notice && <p className="notice" role="status">{notice}</p>}
    {loading ? <p role="status">Loading administration…</p> : <>
      {tab === 'questions' && <section role="tabpanel" aria-label="Question bank" className="admin-grid">
        <form className="panel admin-form" onSubmit={saveQuestion}>
          <h2>{editingId ? 'Edit question' : 'Create question'}</h2>
          <label>Question text<textarea required maxLength={4000} value={question.text} onChange={(e) => setQuestion({ ...question, text: e.target.value })} /></label>
          <label>Category<input required maxLength={100} value={question.category} onChange={(e) => setQuestion({ ...question, category: e.target.value })} /></label>
          {question.options.map((option, index) => <label key={index}>Option {index + 1}<input required maxLength={1000} value={option} onChange={(e) => changeOption(index, e.target.value)} /></label>)}
          <div className="admin-actions">
            <button type="button" className="button subtle" disabled={question.options.length >= 10} onClick={() => setQuestion({ ...question, options: [...question.options, ''] })}>Add option</button>
            <button type="button" className="button subtle" disabled={question.options.length <= 2} onClick={() => setQuestion({ ...question, options: question.options.slice(0, -1), correctOption: Math.min(question.correctOption, question.options.length - 2) })}>Remove last option</button>
          </div>
          <label>Correct answer<select value={question.correctOption} onChange={(e) => setQuestion({ ...question, correctOption: Number(e.target.value) })}>
            {question.options.map((_, index) => <option key={index} value={index}>Option {index + 1}</option>)}
          </select></label>
          <div className="admin-actions"><button className="button primary" disabled={busy}>Save question</button>
            {editingId && <button type="button" className="button subtle" onClick={() => { setEditingId(null); setQuestion(emptyQuestion); }}>Cancel edit</button>}</div>
        </form>
        <div className="panel admin-list">
          <h2>Question bank</h2>
          {!questions.length && <p>No questions have been created.</p>}
          {questions.map((item) => <article className="admin-item" key={keyFor(item)}>
            <h3>{item.text}</h3><p>{item.category} · {item.disabled || item.status === 'disabled' ? 'Disabled' : 'Active'}</p>
            <div className="admin-actions">
              <button className="button subtle" aria-label={'Edit ' + item.text} disabled={busy} onClick={() => {
                setEditingId(keyFor(item));
                setQuestion({ text: item.text, category: item.category, options: [...item.options], correctOption: item.correctOption });
              }}>Edit<span className="sr-only"> {item.text}</span></button>
              <button className="button subtle" aria-label={'Disable ' + item.text} disabled={busy || item.disabled || item.status === 'disabled'} onClick={() => perform(async () => {
                await adminApi.disableQuestion(keyFor(item), token); await refresh(); setNotice('Question disabled for new attempts.');
              })}>Disable<span className="sr-only"> {item.text}</span></button>
            </div>
          </article>)}
        </div>
      </section>}
      {tab === 'exams' && <section role="tabpanel" aria-label="Exam scheduling" className="admin-grid">
        <form className="panel admin-form" onSubmit={createExam}>
          <h2>Schedule an exam</h2>
          <label>Exam title<input required maxLength={200} value={exam.title} onChange={(e) => setExam({ ...exam, title: e.target.value })} /></label>
          <label>Exam category<input required maxLength={100} value={exam.category} onChange={(e) => setExam({ ...exam, category: e.target.value })} /></label>
          <label>Duration in minutes<input required type="number" min="1" step="1" value={exam.durationMinutes} onChange={(e) => setExam({ ...exam, durationMinutes: Number(e.target.value) })} /></label>
          <label>Number of questions<input required type="number" min="1" step="1" value={exam.questionCount} onChange={(e) => setExam({ ...exam, questionCount: Number(e.target.value) })} /></label>
          <label>Opens at<input required type="datetime-local" value={exam.startTime} onChange={(e) => setExam({ ...exam, startTime: e.target.value })} /></label>
          <label>Closes at<input required type="datetime-local" min={exam.startTime || undefined} value={exam.endTime} onChange={(e) => setExam({ ...exam, endTime: e.target.value })} /></label>
          <label className="admin-checkbox"><input type="checkbox" checked={exam.negativeMarking} onChange={(e) => setExam({ ...exam, negativeMarking: e.target.checked })} />Deduct one point for each incorrect answer</label>
          <button className="button primary" disabled={busy}>Create exam</button>
        </form>
        <div className="panel admin-list"><h2>Scheduled exams</h2>
          {!exams.length && <p>No exams have been scheduled.</p>}
          {exams.map((item) => <article className="admin-item" key={keyFor(item)}>
            <h3>{item.title}</h3><p>{item.category} · {item.questionCount} questions · {item.durationMinutes} minutes</p>
            <p>{new Date(item.startTime).toLocaleString()} – {new Date(item.endTime).toLocaleString()}</p>
          </article>)}
        </div>
      </section>}
      {tab === 'reports' && <section role="tabpanel" aria-label="Reports" className="panel admin-list">
        <h2>Result reports</h2>
        <form className="admin-report-form" onSubmit={showReport}>
          <label>Group by<select value={group} onChange={(e) => { setGroup(e.target.value); setReportId(''); setReport(null); }}>
            <option value="exams">Exam</option><option value="students">Student</option>
          </select></label>
          <label>{group === 'exams' ? 'Select exam' : 'Select student'}<select required value={reportId} onChange={(e) => { setReportId(e.target.value); setReport(null); }}>
            <option value="">Choose…</option>
            {(group === 'exams' ? exams : students).map((item) => <option key={keyFor(item)} value={keyFor(item)}>{item.title || item.name}{item.email ? ' (' + item.email + ')' : ''}</option>)}
          </select></label>
          <button className="button primary" disabled={busy || !reportId}>Load report</button>
        </form>
        {report && <>
          <p role="status">{report.count} completed attempts · Average score {report.averageScore === null ? '—' : report.averageScore.toFixed(2)}</p>
          {!report.results.length ? <p>No submitted results for this selection.</p> :
            <div className="history-table-wrap"><table className="history-table"><thead><tr><th>Exam</th><th>Student</th><th>Score</th><th>Correct</th><th>Wrong</th><th>Unanswered</th><th>Completed</th></tr></thead><tbody>
              {report.results.map((item) => <tr key={item.resultId}><td>{item.examTitle}</td><td>{students.find((student) => keyFor(student) === item.studentId)?.name || item.studentId}</td><td>{item.score} / {item.maximumScore}</td><td>{item.correctCount}</td><td>{item.incorrectCount}</td><td>{item.unansweredCount}</td><td>{new Date(item.completedAt).toLocaleString()}</td></tr>)}
            </tbody></table></div>}
        </>}
      </section>}
    </>}
  </Shell>;
}
