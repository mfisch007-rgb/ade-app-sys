provider "aws" { region = "eu-west-1" } resource "aws_instance" "ade_kernel" { ami = "ami-0c55b159cbfafe1f0" instance_type = "t3.xlarge" tags = { Name = "ADE-Production-Kernel" } }
