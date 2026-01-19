locals {
  domain_name = "clock-api.irdn.is" # trimsuffix(data.aws_route53_zone.this.name, ".")
}

###################
# HTTP API Gateway
###################

module "api_gateway" {
  source  = "terraform-aws-modules/apigateway-v2/aws"
  version = "2.2.2"

  name          = "${random_pet.this.id}-http"
  description   = "Clock API"
  protocol_type = "HTTP"

  cors_configuration = {
    allow_headers = ["content-type", "x-amz-date", "authorization", "x-api-key", "x-amz-security-token", "x-amz-user-agent"]
    allow_methods = ["*"]
    allow_origins = ["*"]
  }

  domain_name                 = local.domain_name
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

    "POST /parse-lineup" = {
      lambda_arn             = module.parse-lineup.lambda_function_arn
      payload_format_version = "2.0"
      timeout_milliseconds   = 30000
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
    Name = "clock-api"
  }
}

######
# ACM
######

data "aws_route53_zone" "this" {
  name = "irdn.is"
}

module "acm" {
  source  = "terraform-aws-modules/acm/aws"
  version = "~> 3.0"

  domain_name = local.domain_name
  zone_id     = data.aws_route53_zone.this.id
}

##########
# Route53
##########

resource "aws_route53_record" "api" {
  zone_id = data.aws_route53_zone.this.zone_id
  name    = local.domain_name
  type    = "A"

  alias {
    name                   = module.api_gateway.apigatewayv2_domain_name_configuration[0].target_domain_name
    zone_id                = module.api_gateway.apigatewayv2_domain_name_configuration[0].hosted_zone_id
    evaluate_target_health = false
  }
}

##################
# Extra resources
##################

resource "random_pet" "this" {
  length = 2
}

resource "aws_cloudwatch_log_group" "logs" {
  name = "clock-api-${random_pet.this.id}"
}

#############################################
# Using packaged function from Lambda module
#############################################

module "match-report" {
  source  = "terraform-aws-modules/lambda/aws"
  version = "7.4.0"

  function_name = "${random_pet.this.id}-match-report"
  description   = "Match report"
  handler       = "app.lambda_handler"
  runtime       = "python3.12"

  publish = true
  timeout = 20

  build_in_docker = true
  source_path     = "${path.module}/../clock-api/match-report"

  vpc_security_group_ids = [
    "sg-03ecf18a377c6c35f"
  ]
  vpc_subnet_ids = [
    "subnet-0c45ac69865df1ecf",
    "subnet-09299f279812c8762",
    "subnet-0191832d9edda018a",
  ]
  attach_network_policy              = true
  replace_security_groups_on_destroy = true
  replacement_security_group_ids     = ["sg-03ecf18a377c6c35f"]

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

  function_name = "${random_pet.this.id}-weather"
  description   = "Weather"
  handler       = "app.lambda_handler"
  runtime       = "python3.12"

  publish = true
  timeout = 10

  build_in_docker = true
  source_path     = "${path.module}/../clock-api/weather"

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

  function_name = "${random_pet.this.id}-match-report-v2"
  description   = "Match report for new admin interface"
  handler       = "app.lambda_handler"
  runtime       = "python3.12"

  publish = true

  timeout = 20

  build_in_docker = true
  source_path     = "${path.module}/../clock-api/match-report-v2"

  vpc_security_group_ids = [
    "sg-03ecf18a377c6c35f"
  ]
  vpc_subnet_ids = [
    "subnet-0c45ac69865df1ecf",
    "subnet-09299f279812c8762",
    "subnet-0191832d9edda018a",
  ]
  attach_network_policy              = true
  replace_security_groups_on_destroy = true
  replacement_security_group_ids     = ["sg-03ecf18a377c6c35f"]

  allowed_triggers = {
    AllowExecutionFromAPIGateway = {
      service    = "apigateway"
      source_arn = "${module.api_gateway.apigatewayv2_api_execution_arn}/*/*"
    }
  }
}

resource "aws_secretsmanager_secret" "gemini_api_key" {
  name        = "clock-api/gemini-api-key"
  description = "Gemini API key for parse-lineup Lambda"
}

module "parse-lineup" {
  source  = "terraform-aws-modules/lambda/aws"
  version = "7.4.0"

  function_name = "${random_pet.this.id}-parse-lineup"
  description   = "Parse match lineup from image using Gemini"
  handler       = "app.lambda_handler"
  runtime       = "python3.12"

  publish     = true
  timeout     = 30
  memory_size = 512

  build_in_docker = true
  source_path     = "${path.module}/../clock-api/parse-lineup"

  environment_variables = {
    GEMINI_API_KEY_SECRET_ARN = aws_secretsmanager_secret.gemini_api_key.arn
  }

  attach_policy_statements = true
  policy_statements = {
    secrets_manager = {
      effect    = "Allow"
      actions   = ["secretsmanager:GetSecretValue"]
      resources = [aws_secretsmanager_secret.gemini_api_key.arn]
    }
  }

  allowed_triggers = {
    AllowExecutionFromAPIGateway = {
      service    = "apigateway"
      source_arn = "${module.api_gateway.apigatewayv2_api_execution_arn}/*/*"
    }
  }
}
