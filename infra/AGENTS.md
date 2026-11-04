# Infrastructure

Terraform-managed AWS infrastructure with modular design and OIDC-based GitHub Actions authentication.

## Directory Structure

```
infra/
├── access/           # OIDC provider + IAM roles for GitHub Actions
├── devpod-creds/     # Legacy/specialized IAM key + remote Devpod provisioning
├── modules/
│   └── web/          # Reusable module for frontend + API stack
├── prod/             # Production environment
└── staging/          # Staging environment
```

## Terraform States

| State | S3 Key | Purpose |
|-------|--------|---------|
| access | `vikes-match-clock/access/terraform.tfstate` | GitHub OIDC provider, IAM roles |
| devpod-creds | `vikes-match-clock/devpod-creds/terraform.tfstate` | IAM user + creds for devpod staging deploy |
| prod | `vikes-match-clock/terraform.tfstate` | Production infrastructure |
| staging | `vikes-match-clock/staging/terraform.tfstate` | Staging infrastructure |

All states use the `vikes-misc-tf-state` S3 bucket in `eu-west-1`.

## OIDC Authentication

GitHub Actions AWS deployment jobs authenticate via OIDC without static AWS
keys in those jobs. This claim is specific to CI: local operators use separately
approved AWS credentials, and the legacy `devpod-creds` stack creates a static
IAM access key. Firebase deployment authentication is separate.

| Role | Assumable By | Purpose |
|------|--------------|---------|
| `github-master-deploy` | `sindrig/vikes-match-clock:ref:refs/heads/master` | Production deployments |
| `github-staging-deploy` | `sindrig/vikes-match-clock:pull_request` | Staging deployments |

Both roles have:
- S3 read access to terraform state bucket (for `terraform output`)
- S3/CloudFront permissions for their respective environments (attached by web module)

## Web Module (`modules/web/`)

Reusable module that creates:
- CloudFront + S3 CDN for frontend
- API Gateway (HTTP) with custom domain
- Lambda functions: clock-api-v3
- ACM certificates
- Route53 records
- IAM deploy policy (attached to OIDC role)

### Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `stage` | Environment name | `prod`, `staging` |
| `frontend_domain` | CloudFront domain | `klukka.irdn.is` |
| `api_domain` | API Gateway domain | `clock-api.irdn.is` |
| `deploy_role_name` | IAM role name to attach deploy permissions | `github-master-deploy` |

### Outputs

| Output | Description |
|--------|-------------|
| `frontend_bucket` | S3 bucket name for frontend assets |
| `cloudfront_distribution_id` | CloudFront distribution ID |
| `api_endpoint` | Full API URL |

## Applying Changes

These are infrastructure mutation steps for an explicitly authorized operator,
not checkout/bootstrap or a response to missing credentials. For local AWS
loaders and access retrieval, see [the environment contract](../docs/environment.md#manual-aws-staging-operations).

Order matters due to dependencies:

```bash
# 1. Access (creates OIDC roles that prod/staging reference)
cd infra/access && terraform apply

# 2. Prod (references access outputs)
cd ../prod && terraform apply

# 3. Staging (references access outputs)
cd ../staging && terraform apply
```

### Legacy Devpod credential provisioning

`devpod-creds/main.tf` is retained for the existing specialized operator path.
It creates an IAM user/static key, writes `devpod-creds.txt` as a sensitive local
Bash file, then provisions it over SSH to the configured Devpod host/user/path.
Those fixed remote settings describe that installation, not a portable
worktree requirement. Use only with deliberate authorization for that host and
IAM/state changes, plus the necessary AWS and SSH access. Ask the infrastructure
maintainer for ordinary staging access; missing/expired credentials do not call
for applying this stack or the staging stack.

## State Migration (Historical)

The `prod/moves.tf` file contains `moved {}` blocks from the original flat structure migration. These ensured existing resources weren't destroyed when modularizing. Safe to keep for reference.

## Lambda Source Paths

Lambda functions are built from `clock-api/` directory. The module uses relative paths:
```hcl
source_path = "${path.module}/../../../clock-api/v3"
```

Lambdas are built in Docker (`build_in_docker = true`) for consistent Python dependencies.

## VPC Configuration

The `clock-api-v3` Lambda does NOT run in VPC (only calls external APIs: Analyticom, vedur.is, OpenWeatherMap). This is important to note as it simplifies networking and avoids VPC interface endpoint costs.

