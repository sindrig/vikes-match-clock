output "frontend_bucket" {
  description = "S3 bucket name for frontend assets"
  value       = module.webpage.s3_bucket
}

output "frontend_bucket_arn" {
  description = "S3 bucket ARN for frontend assets"
  value       = module.webpage.s3_bucket_arn
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID"
  value       = module.webpage.cf_id
}

output "cloudfront_distribution_arn" {
  description = "CloudFront distribution ARN"
  value       = module.webpage.cf_arn
}

output "api_endpoint" {
  description = "API Gateway endpoint URL"
  value       = "https://${var.api_domain}"
}

output "api_gateway_id" {
  description = "API Gateway ID"
  value       = module.api_gateway.apigatewayv2_api_id
}
