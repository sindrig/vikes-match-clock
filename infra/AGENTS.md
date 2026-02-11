# Infrastructure

Terraform-managed AWS infrastructure with modular design and OIDC-based GitHub Actions authentication.

## Directory Structure

```
infra/
├── access/           # OIDC provider + IAM roles for GitHub Actions
├── modules/
│   └── web/          # Reusable module for frontend + API stack
├── prod/             # Production environment
└── staging/          # Staging environment
```

## Terraform States

| State | S3 Key | Purpose |
|-------|--------|---------|
| access | `vikes-match-clock/access/terraform.tfstate` | GitHub OIDC provider, IAM roles |
| prod | `vikes-match-clock/terraform.tfstate` | Production infrastructure |
| staging | `vikes-match-clock/staging/terraform.tfstate` | Staging infrastructure |

All states use the `vikes-misc-tf-state` S3 bucket in `eu-west-1`.

## OIDC Authentication

No static AWS credentials are used. GitHub Actions authenticates via OIDC:

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
- Lambda functions: match-report, match-report-v2, weather
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

Order matters due to dependencies:

```bash
# 1. Access (creates OIDC roles that prod/staging reference)
cd infra/access && terraform apply

# 2. Prod (references access outputs)
cd ../prod && terraform apply

# 3. Staging (references access outputs)
cd ../staging && terraform apply
```

## State Migration (Historical)

The `prod/moves.tf` file contains `moved {}` blocks from the original flat structure migration. These ensured existing resources weren't destroyed when modularizing. Safe to keep for reference.

## Lambda Source Paths

Lambda functions are built from `clock-api/` directory. The module uses relative paths:
```hcl
source_path = "${path.module}/../../../clock-api/match-report"
```

Lambdas are built in Docker (`build_in_docker = true`) for consistent Python dependencies.

## VPC Configuration

`match-report` and `match-report-v2` Lambdas run in VPC for database access:
- Security Group: `sg-03ecf18a377c6c35f`
- Subnets: 3 subnets in eu-west-1

The `weather` Lambda does NOT run in VPC (only needs internet access).
