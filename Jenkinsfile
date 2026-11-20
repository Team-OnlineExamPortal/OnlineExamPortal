pipeline {
  agent { node { label ''; customWorkspace '/workspace/oep' } }
  options { timestamps(); timeout(time: 25, unit: 'MINUTES'); skipDefaultCheckout(true) }
  environment {
    COMPOSE_PROJECT_NAME = 'oep-validation'
    OEP_TEST_MONGO_URI = 'mongodb://127.0.0.1:27018/oep_ci'
    OEP_BASE_URL = 'https://localhost:8443'
    NODE_EXTRA_CA_CERTS = '/workspace/oep/.local/tls/tls.crt'
  }
  stages {
    stage('Install') {
      steps {
        sh 'mkdir -p .local/reports'
        sh 'npm ci --no-audit --no-fund'
        sh 'npm ci --prefix server --no-audit --no-fund'
        sh 'npm ci --prefix client --no-audit --no-fund'
      }
    }
    stage('Static analysis') {
      steps { sh 'npm run lint -- --format json --output-file .local/reports/eslint.json' }
    }
    stage('Unit and UI tests') {
      steps {
        sh 'npm test --prefix server -- --coverage --coverageReporters=json-summary --coverageReporters=text'
        sh 'npm test --prefix client'
        sh 'npm run build --prefix client'
      }
    }
    stage('Container deployment') {
      steps { sh 'docker compose -f compose.yaml -f compose.ci.yaml -f compose.https.yaml up --build -d --wait --wait-timeout 240' }
    }
    stage('Database integration') {
      steps { sh 'node server/scripts/test-results-integration.js' }
    }
    stage('System validation') {
      steps {
        sh 'docker compose -f compose.yaml -f compose.ci.yaml -f compose.https.yaml exec -T -e ADMIN_EMAIL -e ADMIN_PASSWORD api npm run seed:users'
        sh 'node scripts/deployment-smoke.cjs'
        sh 'node scripts/measure-deployment.cjs'
      }
    }
  }
  post {
    always {
      sh 'docker compose -f compose.yaml -f compose.ci.yaml -f compose.https.yaml logs --no-color > .local/reports/compose.log || true'
      archiveArtifacts artifacts: '.local/reports/**,server/coverage/coverage-summary.json', allowEmptyArchive: true
      // The isolated CI project owns these disposable volumes.
      sh 'docker compose -f compose.yaml -f compose.ci.yaml -f compose.https.yaml down --volumes --remove-orphans'
    }
  }
}
