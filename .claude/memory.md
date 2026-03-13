# Paperclip Project Memory

## Project Overview
Open-source orchestration platform for autonomous AI companies. Node.js/React monorepo.

## Infrastructure
- **Pulumi stack**: `/home/pestilence/repos/personal/stax/pulumi/stacks/21-paperclip/`
- **Module**: `/home/pestilence/repos/personal/stax/pulumi/modules/services/paperclip.py`
- **Namespace**: `paperclip`
- **Image**: `harbor.spooty.io/library/paperclip:latest-arm64`
- **URL**: https://paperclip.spooty.io
- **Database**: PostgreSQL 16 Alpine (dedicated deployment, not PGlite)
- **Ingress**: Traefik IngressRoute with Authentik SSO forward auth
- **Pulumi passphrase**: `stax-stage` (for `stage` stack)

## Current State (2026-03-13)
- Fresh PostgreSQL database (previous data lost to Longhorn volume corruption)
- App running in `authenticated` mode, bootstrap pending (no companies configured)
- 6 unpushed commits on `master` branch + uncommitted changes (proxy_auth mode work)
- Git remotes: `origin` (paperclipai/paperclip), `fork` (SpootyMcSpoot/paperclip)

## Recent Issues (2026-03-13)
- Longhorn PVC `paperclip-postgres-data` had I/O corruption (faulted volume, disks unavailable)
- Root cause: cluster-wide Longhorn scheduling deadlock from strict zone anti-affinity + no zone labels
- Recovery: deleted faulted PVC + Longhorn volume, Pulumi refresh + up to recreate fresh
- Fix: PR #592 in stax (MERGED) -- set `replicaZoneSoftAntiAffinity: True` in Helm + CRD override
- Also updated `longhorn-default-setting` ConfigMap (Longhorn manager syncs settings from it, overwriting CRD patches)
- Validation test job fails on first deploy (timing - app not ready when test runs)
- 11 faulted detached volumes still need cleanup (orphaned, unrecoverable)

## Architecture Notes
- Base `ServiceModule` class auto-creates: namespace, VPA, ServiceMonitor, PrometheusRule, Grafana dashboard, IngressRoute, SIEM config, security rules, validation test job
- `enable_ingress=True`, `enable_sso=True` in defaults
- Wildcard TLS cert shared from traefik namespace
