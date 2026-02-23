variable "stage" {
  description = "Environment stage (prod, staging)"
  type        = string
}

variable "name_suffix" {
  description = "Optional suffix to add to resource names (e.g., '-staging'). Leave empty for prod to preserve existing resource names."
  type        = string
  default     = ""
}

variable "frontend_domain" {
  description = "Frontend domain (e.g., klukka.irdn.is or staging-klukka.irdn.is)"
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


