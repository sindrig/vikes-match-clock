data "aws_iam_policy_document" "deploy" {
  statement {
    actions = ["lambda:*"]
    resources = [
      module.clock-api-v3.lambda_function_arn
    ]
  }

  statement {
    actions = ["apigateway:*"]
    resources = ["*"]
  }

  statement {
    actions = ["logs:*"]
    resources = [
      aws_cloudwatch_log_group.logs.arn,
      "${aws_cloudwatch_log_group.logs.arn}:*"
    ]
  }

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

  statement {
    actions = [
      "acm:DescribeCertificate",
      "acm:ListCertificates",
      "acm:ListTagsForCertificate",
      "acm:RequestCertificate",
      "acm:DeleteCertificate",
      "acm:AddTagsToCertificate"
    ]
    resources = ["*"]
  }

  statement {
    actions = ["cloudfront:*"]
    resources = [module.webpage.cf_arn]
  }

  statement {
    actions = ["s3:*"]
    resources = [
      module.webpage.s3_bucket_arn,
      "${module.webpage.s3_bucket_arn}/*"
    ]
  }

  statement {
    actions = ["ssm:GetParameter"]
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
