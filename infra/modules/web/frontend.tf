data "aws_acm_certificate" "irdn" {
  provider    = aws.us
  domain      = var.parent_zone_name
  types       = ["AMAZON_ISSUED"]
  most_recent = true
}

module "webpage" {
  source  = "cloudposse/cloudfront-s3-cdn/aws"
  version = "0.92.0"

  namespace         = "vikes"
  stage             = var.stage
  name              = "match-clock"
  aliases           = [var.frontend_domain]
  dns_alias_enabled = true
  parent_zone_name  = var.parent_zone_name

  acm_certificate_arn = data.aws_acm_certificate.irdn.arn
}
