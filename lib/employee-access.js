import 'server-only';
import pg from 'pg';
import { findEmployee } from './employee-repository.js';
import { EmployeeError } from './employee-errors.js';

let pool;
export function employeeDatabase() {
  if (!process.env.DATABASE_URL) throw new EmployeeError('employee_unavailable', 'Employee access needs administrator setup.');
  pool ||= new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3,
    connectionTimeoutMillis: 8000, idleTimeoutMillis: 20000, query_timeout: 10000 });
  return pool;
}

export async function assertNotEmployee(externalId) {
  const employee = await findEmployee(employeeDatabase(), externalId);
  // Inactive employee accounts must not fall back into client/admin privileges either.
  if (employee) throw new EmployeeError('employee_only', 'Use your Employee Dashboard to access your work.', 403);
}
