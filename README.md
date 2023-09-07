# rds-node-pg

A wrapper utility tool to use node-postgres against RDS or other managed database service.

## Key feature

Run database connection update upon the automatic secret rotation happening on RDS side.

## Required Permission

When this module is used on the AWS ECS, the permission for the commands listed below are required.

- DescribeDBClustersCommand for rds-cluster
- GetSecretValueCommand for rds-cluster-secret
