# rds-node-pg

A wrapper utility tool to use node-postgres against RDS Cluster whose secret is managed by SecretsManager.

## Key feature

Run database connection update upon the automatic secret rotation happening on the RDS side.

## Required Permission

When this module is used on the AWS ECS, permission for the below commands is required.

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
