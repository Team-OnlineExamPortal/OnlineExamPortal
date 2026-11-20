# Reproducible deployment and pipeline

## Local application

Run `npm start` at the repository root. The launcher starts the installed MongoDB,
API and frontend, preserves local data, and prints the browser URL.

To provision an administrator for the launcher's default local database, use a
second terminal once, from `server/`:

```powershell
$env:MONGO_URI="mongodb://127.0.0.1:27018/oep"
$env:ADMIN_EMAIL="your-email@example.com"
$env:ADMIN_PASSWORD="choose-a-strong-password"
npm run seed:users
```

Sign in with that account at the same portal URL. It opens Administration.
Existing accounts are skipped by the seed script.

## Docker

Docker Engine with the Compose plugin or Docker Desktop is required. Set a fresh
random `JWT_SECRET` in your terminal, then run:

```sh
docker compose up --build -d --wait
```

Open `http://localhost:8080`. The web container serves the React build and proxies
`/api` to Express. MongoDB is on the internal network and stores data in a named
volume. Only the web port is published, bound to loopback by default.
Run `docker compose down` to stop, keeping the database volume.

To create an administrator, set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in your terminal:

```sh
docker compose exec -e ADMIN_EMAIL -e ADMIN_PASSWORD api npm run seed:users
```

Use `docker compose logs api` for startup failures and `/api/ready` to check the
API's database connectivity. Existing volumes and signing secrets must be retained
between releases. Back up MongoDB before applying schema changes.

## Jenkins CI/CD

### HTTPS deployment

An HTTPS overlay is included. Set `OEP_TLS_DIR` to the absolute directory containing
`tls.crt` and `tls.key`, then run
`docker compose -f compose.yaml -f compose.https.yaml up --build -d --wait`.
Open `https://localhost:8443` with a certificate trusted by the browser. Compose
2.24.4 or newer is required. For institutional hosting, use its issued certificate,
domain and reverse-proxy configuration. The CI job generates a one-day certificate
for its isolated localhost deployment and explicitly trusts that certificate in
Node; TLS verification stays enabled.

`Jenkinsfile` installs locked dependencies, runs ESLint, API/UI tests and coverage,
builds React, builds and deploys the Compose application, executes real MongoDB
integration tests, then runs system, load and sampled availability validation.

`.github/workflows/validation.yml` runs an actual Jenkins controller and executes
that Jenkinsfile on an isolated Ubuntu runner. The controller is bound to
loopback and destroyed after the run. The Docker socket is used only on that
disposable runner. Do not reuse this CI bootstrap on a shared production host.
Normal Jenkins installations keep their authentication and require a trusted agent
with Node 22, npm, Docker and Compose. Configure a Pipeline job from this repository
and use `Jenkinsfile`; set the job workspace to the agent checkout and adjust the
provided CI workspace `/workspace/oep` for that agent.

CI creates a new random database signing secret and a synthetic administrator
password for each run. They are masked in the runner logs. JWTs and account secrets
stay outside the archived report folder.

Download `project-validation-evidence` from the Actions run for Jenkins logs,
static analysis, coverage, Compose logs, system-check JSON, latency percentiles
and timestamped readiness samples. The load profile is 20 concurrent readers for
30 seconds with p95 at most 500 ms. The availability demonstration is a two-minute
active test-exam window, sampled every two seconds. Faculty/team agreement on the
acceptance load and representative deployment remains a review decision.

## Production boundary

This Compose configuration is a local/test deployment. Before an internet-facing
release, terminate HTTPS at the institutional reverse proxy, configure database
authentication and backups, and apply the institution's retention and result-release
policy. The short monitored test window demonstrates the probe and the deployed
application; it does not establish long-term availability.
