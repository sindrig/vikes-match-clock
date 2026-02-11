data "aws_iam_policy_document" "deploy" {
  statement {
    actions = ["s3:*"]
    resources = [
      module.webpage.s3_bucket_arn,
      "${module.webpage.s3_bucket_arn}/*"
    ]
  }

  statement {
    actions   = ["cloudfront:CreateInvalidation"]
    resources = [module.webpage.cf_arn]
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
