data "aws_route53_zone" "this" {
  name = var.parent_zone_name
}

module "acm" {
  source  = "terraform-aws-modules/acm/aws"
  version = "~> 3.0"

  domain_name = var.api_domain
  zone_id     = data.aws_route53_zone.this.id
}

resource "random_pet" "this" {
  length = 2
}

resource "aws_cloudwatch_log_group" "logs" {
  name = "clock-api-${random_pet.this.id}${var.name_suffix}"
}

module "api_gateway" {
  source  = "terraform-aws-modules/apigateway-v2/aws"
  version = "2.2.2"

  name          = "${random_pet.this.id}${var.name_suffix}-http"
  description   = "Clock API (${var.stage})"
  protocol_type = "HTTP"

  cors_configuration = {
    allow_headers = ["content-type", "x-amz-date", "authorization", "x-api-key", "x-amz-security-token", "x-amz-user-agent"]
    allow_methods = ["*"]
    allow_origins = ["*"]
  }

  domain_name                 = var.api_domain
  domain_name_certificate_arn = module.acm.acm_certificate_arn

  default_stage_access_log_destination_arn = aws_cloudwatch_log_group.logs.arn
  default_stage_access_log_format          = "$context.identity.sourceIp - - [$context.requestTime] \"$context.httpMethod $context.routeKey $context.protocol\" $context.status $context.responseLength $context.requestId $context.integrationErrorMessage"

  default_route_settings = {
    detailed_metrics_enabled = true
    throttling_burst_limit   = 100
    throttling_rate_limit    = 100
  }

  integrations = {
    "ANY /match-report" = {
      lambda_arn             = module.match-report.lambda_function_arn
      payload_format_version = "2.0"
      timeout_milliseconds   = 12000
    }

    "ANY /match-report/v2" = {
      lambda_arn             = module.match-report-v2.lambda_function_arn
      payload_format_version = "2.0"
      timeout_milliseconds   = 12000
    }

    "ANY /currentWeather" = {
      lambda_arn             = module.weather.lambda_function_arn
      payload_format_version = "2.0"
      timeout_milliseconds   = 12000
    }

    "$default" = {
      lambda_arn = module.match-report.lambda_function_arn
    }
  }

  tags = {
    Name  = "clock-api"
    Stage = var.stage
  }
}

resource "aws_route53_record" "api" {
  zone_id = data.aws_route53_zone.this.zone_id
  name    = var.api_domain
  type    = "A"

  alias {
    name                   = module.api_gateway.apigatewayv2_domain_name_configuration[0].target_domain_name
    zone_id                = module.api_gateway.apigatewayv2_domain_name_configuration[0].hosted_zone_id
    evaluate_target_health = false
  }
}

module "match-report" {
  source  = "terraform-aws-modules/lambda/aws"
  version = "7.4.0"

  function_name = "${random_pet.this.id}${var.name_suffix}-match-report"
  description   = "Match report (${var.stage})"
  handler       = "app.lambda_handler"
  runtime       = "python3.12"

  publish = true
  timeout = 20

  build_in_docker = true
  source_path     = "${path.module}/../../../clock-api/match-report"

  vpc_security_group_ids             = var.vpc_security_group_ids
  vpc_subnet_ids                     = var.vpc_subnet_ids
  attach_network_policy              = true
  replace_security_groups_on_destroy = true
  replacement_security_group_ids     = var.vpc_security_group_ids

  allowed_triggers = {
    AllowExecutionFromAPIGateway = {
      service    = "apigateway"
      source_arn = "${module.api_gateway.apigatewayv2_api_execution_arn}/*/*"
    }
  }
}

module "weather" {
  source  = "terraform-aws-modules/lambda/aws"
  version = "7.4.0"

  function_name = "${random_pet.this.id}${var.name_suffix}-weather"
  description   = "Weather (${var.stage})"
  handler       = "app.lambda_handler"
  runtime       = "python3.12"

  publish = true
  timeout = 10

  build_in_docker = true
  source_path     = "${path.module}/../../../clock-api/weather"

  allowed_triggers = {
    AllowExecutionFromAPIGateway = {
      service    = "apigateway"
      source_arn = "${module.api_gateway.apigatewayv2_api_execution_arn}/*/*"
    }
  }
}

module "match-report-v2" {
  source  = "terraform-aws-modules/lambda/aws"
  version = "7.4.0"

  function_name = "${random_pet.this.id}${var.name_suffix}-match-report-v2"
  description   = "Match report v2 (${var.stage})"
  handler       = "app.lambda_handler"
  runtime       = "python3.12"

  publish = true
  timeout = 20

  build_in_docker = true
  source_path     = "${path.module}/../../../clock-api/match-report-v2"

  vpc_security_group_ids             = var.vpc_security_group_ids
  vpc_subnet_ids                     = var.vpc_subnet_ids
  attach_network_policy              = true
  replace_security_groups_on_destroy = true
  replacement_security_group_ids     = var.vpc_security_group_ids

  allowed_triggers = {
    AllowExecutionFromAPIGateway = {
      service    = "apigateway"
      source_arn = "${module.api_gateway.apigatewayv2_api_execution_arn}/*/*"
    }
  }
}
