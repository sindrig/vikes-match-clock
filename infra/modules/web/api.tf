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
    "ANY /v3/{proxy+}" = {
      lambda_arn             = module.clock-api-v3.lambda_function_arn
      payload_format_version = "2.0"
      timeout_milliseconds   = 12000
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

module "clock-api-v3" {
  source  = "terraform-aws-modules/lambda/aws"
  version = "8.5.0"

  function_name = "${random_pet.this.id}${var.name_suffix}-clock-api-v3"
  description   = "Clock API v3 - FastAPI (${var.stage})"
  handler       = "run.sh"
  runtime       = "python3.12"

  publish = true
  timeout = 20

  build_in_docker = true
  trigger_on_package_timestamp = false
  source_path     = "${path.module}/../../../clock-api/v3"
  ignore_source_code_hash = true

  layers = [
    "arn:aws:lambda:eu-west-1:753240598075:layer:LambdaAdapterLayerX86:20"
  ]

  environment_variables = {
    AWS_LAMBDA_EXEC_WRAPPER = "/opt/bootstrap"
    PORT                    = "8000"
  }

  attach_policy_json = true
  policy_json = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["ssm:GetParameter"]
      Resource = "arn:aws:ssm:*:*:parameter/vikes-match-clock/*"
    }]
  })

  allowed_triggers = {
    AllowExecutionFromAPIGateway = {
      service    = "apigateway"
      source_arn = "${module.api_gateway.apigatewayv2_api_execution_arn}/*/*"
    }
  }
}
