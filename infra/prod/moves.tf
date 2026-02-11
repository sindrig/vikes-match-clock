moved {
  from = data.aws_acm_certificate.irdn
  to   = module.web.data.aws_acm_certificate.irdn
}

moved {
  from = data.aws_route53_zone.this
  to   = module.web.data.aws_route53_zone.this
}

moved {
  from = module.webpage
  to   = module.web.module.webpage
}

moved {
  from = github_actions_secret.frontend_bucket_secret
  to   = github_actions_secret.frontend_bucket
}

moved {
  from = github_actions_secret.frontend_cloudfront_secret
  to   = github_actions_secret.cloudfront_distribution_id
}

moved {
  from = module.api_gateway
  to   = module.web.module.api_gateway
}

moved {
  from = module.acm
  to   = module.web.module.acm
}

moved {
  from = aws_route53_record.api
  to   = module.web.aws_route53_record.api
}

moved {
  from = random_pet.this
  to   = module.web.random_pet.this
}

moved {
  from = aws_cloudwatch_log_group.logs
  to   = module.web.aws_cloudwatch_log_group.logs
}

moved {
  from = module.match-report
  to   = module.web.module.match-report
}

moved {
  from = module.match-report-v2
  to   = module.web.module.match-report-v2
}

moved {
  from = module.weather
  to   = module.web.module.weather
}
