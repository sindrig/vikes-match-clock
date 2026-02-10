variable "stage" {
  description = "Environment stage (prod, staging)"
  type        = string
}

variable "frontend_domain" {
  description = "Frontend domain (e.g., klukka.irdn.is or staging.irdn.is)"
  type        = string
}

variable "api_domain" {
  description = "API domain (e.g., clock-api.irdn.is or clock-api-staging.irdn.is)"
  type        = string
}

variable "deploy_role_name" {
  description = "Name of the IAM role to attach deploy permissions to"
  type        = string
}

variable "parent_zone_name" {
  description = "Parent Route53 zone name"
  type        = string
  default     = "irdn.is"
}

variable "vpc_security_group_ids" {
  description = "VPC security group IDs for Lambda functions"
  type        = list(string)
  default     = ["sg-03ecf18a377c6c35f"]
}

variable "vpc_subnet_ids" {
  description = "VPC subnet IDs for Lambda functions"
  type        = list(string)
  default = [
    "subnet-0c45ac69865df1ecf",
    "subnet-09299f279812c8762",
    "subnet-0191832d9edda018a",
  ]
}
