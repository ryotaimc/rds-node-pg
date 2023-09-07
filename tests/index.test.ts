import { describe, test, expect } from "@jest/globals";
import { RdsPGPool } from "../src/index";
import { mockClient } from "aws-sdk-client-mock";
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

/**
 * need to run docker-compose up at the directory under
 * ../../../database/customer_db folder to run this manual test
 */
const mockSecretsManagerClient = mockClient(SecretsManagerClient);

mockSecretsManagerClient
  .on(GetSecretValueCommand)
  .resolvesOnce({
    // 1st response
    SecretString: JSON.stringify({
      username: "postgres",
      password: "postgres",
    }),
  })
  .resolves({
    // response after
    SecretString: JSON.stringify({
      username: "postgres",
      password: "postgres1",
    }),
  });

describe("postgres pool password update test", () => {
  test("password is updated and 2nd connection failed to authenticate but success with retry", async () => {
    const pgPool = new RdsPGPool("localhost", "foo", "customer_db", 25432);
    try {
      await pgPool.query(`select * from customer`);
      await pgPool.query("ALTER USER postgres with password 'postgres1'");
      // The 1st connection is already authenticated with old password
      // But the 2nd connection with new command is not and cause auth error
      // That 2nd connection failure triggers recreation of the pool
      await Promise.allSettled([
        pgPool.query(`select * from customer`),
        pgPool.query(`select * from customer`),
      ]);

      // Those queries all use newly created pool
      // and it will be queue on pool since the query is more than default connection number 10
      await Promise.allSettled([
        pgPool.query(`select * from customer`),
        pgPool.query(`select * from customer`),
        pgPool.query(`select * from customer`),
        pgPool.query(`select * from customer`),
        pgPool.query(`select * from customer`),
        pgPool.query(`select * from customer`),
        pgPool.query(`select * from customer`),
        pgPool.query(`select * from customer`),
        pgPool.query(`select * from customer`),
      ]);
      // need to reach here
      expect(true).toBe(true);
    } catch (err) {
      console.error(err);
      // shouldn't reach here
      expect(true).toBe(false);
    } finally {
      await pgPool.end();
    }
  }, 300000);
});
