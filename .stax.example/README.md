# STAX Deployment Configuration

This directory contains STAX-specific configuration files.

## Setup

1. Copy `.stax.example/` to `.stax/`:
   ```bash
   cp -r .stax.example .stax
   ```

2. Update `.stax/env` with your STAX cluster endpoints

3. The `.stax/` directory is gitignored and won't be committed

## Files

- `env` - STAX-specific environment variables
- `kustomization.yaml` - Kubernetes deployment overlay
- `values.yaml` - Helm values for STAX deployment
