data "aws_iam_policy_document" "deploy" {
  # Lambda: manage the clock-api-v3 function and its versions/aliases
  statement {
    actions = ["lambda:*"]
    resources = [
      module.clock-api-v3.lambda_function_arn,
      "${module.clock-api-v3.lambda_function_arn}:*"
    ]
  }

  # API Gateway: manage HTTP API and its resources
  statement {
    actions   = ["apigateway:*"]
    resources = ["*"]
  }

  # CloudWatch Logs: API Gateway access logs + Lambda log group
  statement {
    actions   = ["logs:*"]
    resources = ["*"]
  }

  # IAM: manage Lambda execution roles and policies
  statement {
    actions = [
      "iam:GetRole",
      "iam:CreateRole",
      "iam:DeleteRole",
      "iam:PassRole",
      "iam:AttachRolePolicy",
      "iam:DetachRolePolicy",
      "iam:PutRolePolicy",
      "iam:GetRolePolicy",
      "iam:DeleteRolePolicy",
      "iam:TagRole",
      "iam:UntagRole",
      "iam:ListAttachedRolePolicies",
      "iam:ListRolePolicies",
      "iam:CreatePolicy",
      "iam:GetPolicy",
      "iam:DeletePolicy",
      "iam:GetPolicyVersion",
      "iam:CreatePolicyVersion",
      "iam:DeletePolicyVersion",
      "iam:ListPolicyVersions",
      "iam:ListInstanceProfilesForRole"
    ]
    resources = [
      "arn:aws:iam::*:role/*clock-api*",
      "arn:aws:iam::*:policy/*clock-api*"
    ]
  }

  # IAM: manage the deploy policy and role attachment (self-referential)
  statement {
    actions = [
      "iam:GetPolicy",
      "iam:GetPolicyVersion",
      "iam:CreatePolicyVersion",
      "iam:DeletePolicyVersion",
      "iam:ListPolicyVersions",
      "iam:ListAttachedRolePolicies",
      "iam:AttachRolePolicy",
      "iam:DetachRolePolicy"
    ]
    resources = [
      "arn:aws:iam::*:policy/vikes-match-clock-deploy-*",
      "arn:aws:iam::*:role/${var.deploy_role_name}"
    ]
  }

  # Route53: manage DNS records for API and frontend
  statement {
    actions = [
      "route53:GetHostedZone",
      "route53:ListResourceRecordSets",
      "route53:ChangeResourceRecordSets",
      "route53:GetChange",
      "route53:ListHostedZones",
      "route53:ListTagsForResource"
    ]
    resources = ["*"]
  }

  # ACM: manage certificates for API and frontend domains
  statement {
    actions = [
      "acm:DescribeCertificate",
      "acm:GetCertificate",
      "acm:ListCertificates",
      "acm:ListTagsForCertificate",
      "acm:RequestCertificate",
      "acm:DeleteCertificate",
      "acm:AddTagsToCertificate"
    ]
    resources = ["*"]
  }

  # CloudFront: manage distribution + Origin Access Identity
  statement {
    actions   = ["cloudfront:*"]
    resources = ["*"]
  }

  # S3: manage frontend bucket, logs bucket, and account-level operations
  statement {
    actions   = ["s3:*"]
    resources = ["*"]
  }

  # SSM: read API keys for Lambda
  statement {
    actions   = ["ssm:GetParameter"]
    resources = ["arn:aws:ssm:*:*:parameter/vikes-match-clock/*"]
  }
}

resource "aws_iam_policy" "deploy" {
  name        = "vikes-match-clock-deploy-${var.stage}"
  description = "Deploy permissions for ${var.stage} environment"
  policy      = data.aws_iam_policy_document.deploy.json
}

resource "aws_iam_role_policy_attachment" "deploy" {
  role       = var.deploy_role_name
  policy_arn = aws_iam_policy.deploy.arn
}
