FROM node:22-bookworm-slim AS node
FROM docker:27-cli AS dockercli
FROM jenkins/jenkins:lts-jdk21
COPY --from=node /usr/local/ /usr/local/
COPY --from=dockercli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=dockercli /usr/local/libexec/docker/cli-plugins/ /usr/local/libexec/docker/cli-plugins/
RUN jenkins-plugin-cli --plugins "workflow-aggregator pipeline-model-definition git junit timestamper"
COPY ci/jenkins/init.groovy /usr/share/jenkins/ref/init.groovy.d/oep-ci.groovy
