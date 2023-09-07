// TODO: make this as a npm package and publish
import pg from "pg";
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import { RDSClient, DescribeDBClustersCommand } from "@aws-sdk/client-rds";

export const getRDSClusterInfo = async (
  dbClusterIdentifier: string,
): Promise<{
  endpoint: string;
  masterUserSecretArn: string;
}> => {
  const rdsClient = new RDSClient({});
  const clusterResult = await rdsClient.send(
    new DescribeDBClustersCommand({
      DBClusterIdentifier: dbClusterIdentifier,
    }),
  );
  const clusterInfo = clusterResult.DBClusters?.[0];
  if (!clusterInfo) {
    throw `cluster: ${dbClusterIdentifier} not found`;
  }
  const { Endpoint, MasterUserSecret } = clusterInfo;
  if (!Endpoint || !MasterUserSecret?.SecretArn) {
    throw `not enough connection info to cluster: ${dbClusterIdentifier}`;
  }
  return {
    endpoint: Endpoint,
    masterUserSecretArn: MasterUserSecret.SecretArn,
  };
};

class ConnectionStatus {
  private static CONNECTION_STATUS: "NULL" | "SETTING_UP" | "SETUP_FINISHED" =
    "NULL";
  public static changeConnectionStatus = (
    updatedStatus: typeof this.CONNECTION_STATUS,
  ) => {
    if (this.CONNECTION_STATUS !== updatedStatus) {
      console.log(
        `DB CONNECTION_STATUS changed from ${this.CONNECTION_STATUS} to ${updatedStatus}`,
      );
    }
    this.CONNECTION_STATUS = updatedStatus;
  };
  public static get = () => {
    return this.CONNECTION_STATUS;
  };
}

export class RdsPGPool {
  private clusterEndpoint: string;
  private clusterPort: number = 5432;
  private masterUserSecretArn: string;
  private databaseName: string;
  private pgPool: pg.Pool | null = null;
  constructor(
    clusterEndpoint: string,
    masterUserSecretArn: string,
    databaseName: string,
    clusterPort?: number,
  ) {
    // DB connection will be established when the first time query method called.
    this.clusterEndpoint = clusterEndpoint;
    this.masterUserSecretArn = masterUserSecretArn;
    this.databaseName = databaseName;
    if (clusterPort) {
      this.clusterPort = clusterPort;
    }
  }
  private async setup() {
    ConnectionStatus.changeConnectionStatus("SETTING_UP");
    if (this.pgPool) {
      this.pgPool = null;
    }
    const secretsManagerClient = new SecretsManagerClient({});
    const dbSecret = await secretsManagerClient.send(
      new GetSecretValueCommand({
        SecretId: this.masterUserSecretArn,
      }),
    );
    if (!dbSecret.SecretString) {
      throw `DB SecretString not found`;
    }
    const { username, password } = JSON.parse(dbSecret.SecretString);
    this.pgPool = new pg.Pool({
      host: this.clusterEndpoint,
      user: username,
      port: this.clusterPort,
      password: password,
      database: this.databaseName,
    });
    // check database connection
    const CONNECTION_CHECK_BACKOFF_MS = 1000;
    for (;;) {
      await new Promise((resolve) => {
        setTimeout(resolve, CONNECTION_CHECK_BACKOFF_MS);
      });
      try {
        const client = await this.pgPool.connect();
        client.release();
        break;
      } catch (err) {
        if ((err as pg.DatabaseError).routine == "57P03") {
          console.log(`waiting for database to start up`);
        } else {
          throw err;
        }
      }
    }
    ConnectionStatus.changeConnectionStatus("SETUP_FINISHED");
  }
  public async query(sqlQuery: string): Promise<pg.QueryResult<any>> {
    // if connection is still connecting then wait for 100ms
    if (ConnectionStatus.get() === "NULL") {
      // TODO: need to remove connect call
      await this.setup();
    }
    let retryCounter = 0;
    // wait if the connection is not connected
    while (ConnectionStatus.get() !== "SETUP_FINISHED") {
      if (retryCounter > 10) {
        throw `ConnectionStatus not changed within 10 retries`;
      }
      await new Promise((resolve) => {
        console.log(
          `waiting for db Connection. Current status ${ConnectionStatus.get()}. RetryCount: ${retryCounter}`,
        );
        setTimeout(resolve, 500);
      });
      retryCounter += 1;
    }
    // if pool is still null then throw error
    if (this.pgPool === null) {
      throw `pgPool is still null after initialization`;
    }
    // Then connection is connected
    try {
      const result = await this.pgPool.query(sqlQuery);
      return result;
    } catch (err) {
      // Add retry for pool connection auth  error
      if ((err as pg.DatabaseError).routine === "auth_failed") {
        console.log(`auth_failed on RDS query, running setup`);
        if (ConnectionStatus.get() == "SETUP_FINISHED") {
          await this.setup();
        }
        return await this.query(sqlQuery);
      }
      console.error(err);
      throw err;
    }
  }
  public async end() {
    await this.pgPool?.end();
    this.pgPool = null;
    console.log("pool end");
    return;
  }
}
