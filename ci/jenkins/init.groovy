// Bootstrap only the isolated CI controller bound to loopback on an ephemeral runner.
import jenkins.model.Jenkins
import org.jenkinsci.plugins.workflow.job.WorkflowJob
import org.jenkinsci.plugins.workflow.cps.CpsFlowDefinition
if (System.getenv('OEP_CI_BOOTSTRAP') != '1') return

def controller = Jenkins.get()
controller.setNumExecutors(1)
def job = controller.getItem('portal') ?: controller.createProject(WorkflowJob, 'portal')
job.definition = new CpsFlowDefinition(new File('/workspace/oep/Jenkinsfile').text, true)
job.save()
job.scheduleBuild2(0)
