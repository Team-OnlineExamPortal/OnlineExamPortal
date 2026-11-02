import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import Shell from '../components/Shell';
import { ApiError, examApi } from '../api';
import { useAuth } from '../auth';

const idFor = (item) => item.questionId || item.id || item._id;

export default function Exam() {
  const { examId } = useParams();
  const { search } = useLocation();
  const { token } = useAuth();
  const [exam, setExam] = useState(null);
  const [error, setError] = useState('');
  const [attemptError, setAttemptError] = useState('');
  const [attempt, setAttempt] = useState(null);
  const [starting, setStarting] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [marked, setMarked] = useState({});
  const [secondsLeft, setSecondsLeft] = useState(null);
  const [saveState, setSaveState] = useState('');
  const submitting = useRef(false);
  const startRequested = useRef(false);
  const attemptStorageKey = `oep-active-attempt-${examId}`;
  const retryQueue = useRef(new Map());

  useEffect(() => {
    examApi.metadata(examId, token).then(setExam).catch((err) => setError(err.message));
  }, [examId, token]);

  async function startExam() {
    setStarting(true); setAttemptError('');
    try {
      const response = await examApi.start(exam.examId || exam.id, token);
      const started = response.attempt || response;
      if (!Array.isArray(started.questions) || started.questions.length === 0) {
        setAttemptError('The attempt service response has no questions. The exam screen could not be opened.');
        return;
      }
      setAttempt(started);
      sessionStorage.setItem(attemptStorageKey, String(started.attemptId || started.id));
      setAnswers(started.answers || {});
      setMarked(started.reviews || {});
      const deadline = started.deadline || started.expiresAt || started.endTime;
      if (deadline) setSecondsLeft(Math.max(0, Math.floor((new Date(deadline).getTime() - Date.now()) / 1000)));
    } catch (err) {
      setAttemptError(err instanceof ApiError && err.status === 404
        ? 'The server does not have the attempt service yet. Your exam has not started and no answers have been saved.'
        : err.message);
    } finally { setStarting(false); }
  }

  useEffect(() => {
    if (!exam || attempt || starting || startRequested.current) return;
    const savedAttemptId = sessionStorage.getItem(attemptStorageKey);
    if (savedAttemptId) {
      startRequested.current = true;
      examApi.getAttempt(savedAttemptId, token).then((response) => {
        const restored = response.attempt || response;
        if (!Array.isArray(restored.questions) || !restored.questions.length) throw new Error('The saved attempt response has no questions.');
        setAttempt(restored);
        setAnswers(restored.answers || {});
        setMarked(restored.reviews || {});
        const deadline = restored.deadline || restored.expiresAt || restored.endTime;
        if (deadline) setSecondsLeft(Math.max(0, Math.floor((new Date(deadline).getTime() - Date.now()) / 1000)));
      }).catch((err) => {
        sessionStorage.removeItem(attemptStorageKey);
        if (new URLSearchParams(search).get('start') === '1') startExam();
        else setAttemptError(err.message || 'Could not restore the saved attempt.');
      });
      return;
    }
    if (new URLSearchParams(search).get('start') === '1') {
      startRequested.current = true;
      startExam();
    }
  }, [exam, search, attempt, starting, token, attemptStorageKey]);

  async function submitAttempt(automatic = false) {
    if (!attempt || submitting.current) return;
    if (!automatic && !window.confirm('Submit your exam now? You will not be able to change your answers after submission.')) return;
    if (!automatic) {
      await retryPendingSaves();
      if (retryQueue.current.size) {
        setAttemptError('Some answers are still waiting to sync. Reconnect and retry before submitting.');
        return;
      }
    }
    submitting.current = true;
    setSaveState('Submitting…');
    try {
      await examApi.submit(attempt.attemptId || attempt.id, token);
      setAttempt({ ...attempt, submitted: true });
      sessionStorage.removeItem(attemptStorageKey);
      setSaveState('Submitted');
    } catch (err) {
      submitting.current = false;
      setAttemptError(err instanceof ApiError && err.status === 404
        ? 'The server submission service is not available yet. Your answers have not been confirmed as submitted.'
        : err.message);
      setSaveState('');
    }
  }

  useEffect(() => {
    if (!attempt || secondsLeft === null || attempt.submitted) return undefined;
    if (secondsLeft <= 0) { submitAttempt(true); return undefined; }
    const timer = window.setTimeout(() => setSecondsLeft((remaining) => remaining - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [attempt, secondsLeft]);

  async function chooseAnswer(question, choiceIndex) {
    const questionId = idFor(question);
    const option = (question.options || question.choices || [])[choiceIndex];
    const optionId = typeof option === 'object' ? option.optionId || option.id || String(choiceIndex) : String(choiceIndex);
    setAnswers((previous) => ({ ...previous, [questionId]: optionId }));
    setSaveState('Saving…');
    const operation = { questionId, optionId, review: Boolean(marked[questionId]) };
    try {
      await examApi.saveAnswer(attempt.attemptId || attempt.id, operation.questionId, operation.optionId, operation.review, token);
      setSaveState('All answers saved');
      retryQueue.current.delete(questionId);
      persistRetryQueue();
    } catch (err) {
      retryQueue.current.set(questionId, operation);
      persistRetryQueue();
      setSaveState('Saved on this device · will retry');
      setAttemptError(err instanceof ApiError && err.status === 404
        ? 'The answer-save service is not available. This answer is only in this browser until it can be sent.'
        : err.message);
    }
  }

  function persistRetryQueue() {
    if (!attempt) return;
    const key = `oep-attempt-pending-${attempt.attemptId || attempt.id}`;
    try {
      if (retryQueue.current.size) localStorage.setItem(key, JSON.stringify([...retryQueue.current.values()]));
      else localStorage.removeItem(key);
    } catch { /* Persistence can be unavailable in private browsing; the page state remains usable. */ }
  }

  async function retryPendingSaves() {
    for (const [questionId, operation] of retryQueue.current) {
      try {
        await examApi.saveAnswer(attempt.attemptId || attempt.id, questionId, operation.optionId, operation.review, token);
        retryQueue.current.delete(questionId);
      } catch { break; }
    }
    persistRetryQueue();
  }

  async function toggleReview(question) {
    const questionId = idFor(question);
    const review = !marked[questionId];
    setMarked((previous) => ({ ...previous, [questionId]: review }));
    const operation = { questionId, optionId: answers[questionId], review };
    try {
      await examApi.saveAnswer(attempt.attemptId || attempt.id, questionId, operation.optionId, review, token);
      retryQueue.current.delete(questionId); persistRetryQueue();
    } catch {
      retryQueue.current.set(questionId, operation); persistRetryQueue();
      setSaveState('Review flag saved on this device · will retry');
    }
  }

  useEffect(() => {
    if (!attempt) return undefined;
    const key = `oep-attempt-pending-${attempt.attemptId || attempt.id}`;
    try {
      const pending = JSON.parse(localStorage.getItem(key) || '[]');
      for (const operation of pending) {
        retryQueue.current.set(operation.questionId, operation);
        setAnswers((previous) => ({ ...previous, [operation.questionId]: operation.optionId }));
        setMarked((previous) => ({ ...previous, [operation.questionId]: operation.review }));
      }
    } catch { /* Ignore malformed local recovery data and keep the server state. */ }
    const retry = async () => { await retryPendingSaves(); if (!retryQueue.current.size) setSaveState('All answers saved'); };
    window.addEventListener('online', retry);
    if (navigator.onLine) retry();
    return () => window.removeEventListener('online', retry);
  }, [attempt, token]);

  if (attempt?.submitted) return <Shell><div className="empty-state"><div className="empty-icon">✓</div><h3>Exam submitted</h3><p>The server accepted your submission. Your result will appear in exam history when the results service is connected.</p><Link className="button primary" to="/history">View history <span>→</span></Link></div></Shell>;

  if (attempt) {
    const question = attempt.questions[currentIndex];
    const questionId = idFor(question);
    const options = question.options || question.choices || [];
    const formattedTime = secondsLeft === null ? '—' : `${Math.floor(secondsLeft / 60).toString().padStart(2, '0')}:${(secondsLeft % 60).toString().padStart(2, '0')}`;
    return <Shell>
      <div className="attempt-topline"><span className="eyebrow muted">EXAM IN PROGRESS</span><div className={`timer ${secondsLeft < 300 ? 'timer-low' : ''}`} aria-live="polite"><span>◷</span>{formattedTime} remaining</div></div>
      <h1 className="page-title">{exam?.title}</h1>
      <div className="attempt-layout">
        <section className="panel question-panel">
          <div className="question-head"><span>Question {currentIndex + 1} <span className="question-total">of {attempt.questions.length}</span></span><button className={`mark-button ${marked[questionId] ? 'is-marked' : ''}`} onClick={() => toggleReview(question)}>{marked[questionId] ? '★ Marked for review' : '☆ Mark for review'}</button></div>
          <div className="progress-track"><span style={{ width: `${((currentIndex + 1) / attempt.questions.length) * 100}%` }} /></div>
          <h2 className="question-text">{question.text || question.questionText}</h2>
          <div className="option-list">{options.map((option, index) => { const optionId = typeof option === 'object' ? option.optionId || option.id || String(index) : String(index); return <button key={`${questionId}-${index}`} className={`option-row ${answers[questionId] === optionId ? 'selected' : ''}`} onClick={() => chooseAnswer(question, index)}><span className="option-letter">{String.fromCharCode(65 + index)}</span><span>{typeof option === 'string' ? option : option.text || option.label}</span><span className="option-radio" /></button>; })}</div>
          <div className="question-controls"><button className="button subtle" onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))} disabled={currentIndex === 0}>← Previous</button><span className="save-state" aria-live="polite">{saveState}</span>{currentIndex < attempt.questions.length - 1 ? <button className="button primary" onClick={() => setCurrentIndex(currentIndex + 1)}>Next question <span>→</span></button> : <button className="button primary" onClick={() => submitAttempt()}>Submit exam <span>→</span></button>}</div>
          {attemptError && <div className="notice error" role="status">{attemptError}</div>}
        </section>
        <aside className="panel question-nav"><h3>Questions</h3><p>Choose a question to review your answer.</p><div className="question-grid">{attempt.questions.map((item, index) => { const id = idFor(item); return <button key={id || index} className={`${index === currentIndex ? 'current' : ''} ${answers[id] !== undefined ? 'answered' : ''} ${marked[id] ? 'review' : ''}`} aria-label={`Question ${index + 1}${marked[id] ? ', marked for review' : ''}`} onClick={() => setCurrentIndex(index)}>{index + 1}</button>; })}</div><div className="nav-legend"><span><i className="legend-answered"/> Answered</span><span><i className="legend-review"/> Review</span></div><button className="finish-button" onClick={() => submitAttempt()}>Finish and submit</button></aside>
      </div>
    </Shell>;
  }

  return <Shell><Link className="back-link" to="/">← Back to overview</Link>
    {error ? <div className="notice error">{error}</div> : !exam ? <div className="center-inline"><span className="spinner"/>Loading exam details…</div> : <>
      <div className="eyebrow muted">EXAM DETAILS</div><h1 className="page-title">{exam.title}</h1>
      <div className="detail-grid"><div className="detail-main panel"><span className="category-pill"><span/>{exam.category}</span><p className="section-description">Review the exam details before continuing.</p><div className="detail-stats"><div><small>Duration</small><strong>{exam.durationMinutes} minutes</strong></div><div><small>Questions</small><strong>{exam.questionCount}</strong></div><div><small>Negative marking</small><strong>{exam.negativeMarking ? 'Applies' : 'None'}</strong></div></div><div className="exam-window"><span>Exam window</span><strong>{new Date(exam.startTime).toLocaleString()} – {new Date(exam.endTime).toLocaleString()}</strong></div>
        {attemptError && <div className="notice error attempt-notice" role="status">{attemptError}</div>}
        <button className="button primary" onClick={startExam} disabled={starting}>{starting ? 'Connecting…' : 'Start exam'} <span>→</span></button>
      </div><aside className="panel instructions"><div className="instructions-icon">✦</div><h3>Before you start</h3><ul><li>Set aside the full exam duration.</li><li>Keep your connection stable.</li><li>The timer should continue until submission.</li></ul><div className="notice info">The attempt service is needed to start an exam and save answers. The student exam screen is ready to connect when those routes are available.</div></aside></div>
    </>}
  </Shell>;
}
