# rds-node-pg

A wrapper utility tool to use node-postgres against RDS which secret is managed by SecretsManager.

## Key feature

Run database connection update upon the automatic secret rotation happening on RDS side.

## Required Permission

When this module is used on the AWS ECS, the permission for the commands listed below are required.

- DescribeDBClustersCommand for rds-cluster
- GetSecretValueCommand for rds-cluster-secret

## How to use

```sh
npm i rds-node-pg
```

```typescript
import { RdsPGPool, getRDSClusterInfo } from "rds-node-pg";

const { masterUserSecretArn, endpoint } = await getRDSClusterInfo(
  "RDS_CLUSTER_NAME_HERE",
);

const pool = new RdsPGPool(endpoint, masterUserSecretArn, "DATABASE_NAME_HERE");

await pool.query(`
select * from your_table_name_here
`);

// at the end of the application
await pool.end();
```
