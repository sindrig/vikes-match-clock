data "aws_iam_policy_document" "grant_deploy" {
  statement {
    actions = [
      "s3:*",
    ]
    resources = [
      module.webpage.s3_bucket_arn,
      "${module.webpage.s3_bucket_arn}/*"
    ]
  }
  statement {
    actions = [
      "cloudfront:CreateInvalidation"
    ]
    resources = ["*"]
  }
}

resource "aws_iam_user" "deployer" {
  name = "vikes-match-clock-deployer"
  path = "/system/"
}

resource "aws_iam_policy" "grant_deploy" {
  name        = "GrantVikesMatchClockDeployment"
  description = "A test grant_deploy"
  policy      = data.aws_iam_policy_document.grant_deploy.json
}

resource "aws_iam_user_policy_attachment" "attach_grant_deploy" {
  user       = aws_iam_user.deployer.name
  policy_arn = aws_iam_policy.grant_deploy.arn
}

resource "aws_iam_access_key" "deployer" {
  user = aws_iam_user.deployer.name
}

resource "github_actions_secret" "deployer_actions_access_key_id" {
  repository      = "vikes-match-clock"
  secret_name     = "AWS_ACCESS_KEY_ID"
  plaintext_value = aws_iam_access_key.deployer.id
}

resource "github_actions_secret" "deployer_actions_secret_key_access" {
  repository      = "vikes-match-clock"
  secret_name     = "AWS_SECRET_ACCESS_KEY"
  plaintext_value = aws_iam_access_key.deployer.secret
}
