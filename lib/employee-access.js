import 'server-only';
import { databasePool } from './database.js';
import { findEmployee } from './employee-repository.js';
import { EmployeeError } from './employee-errors.js';

export function employeeDatabase() {
  if (!process.env.DATABASE_URL) throw new EmployeeError('employee_unavailable', 'Employee access needs administrator setup.');
  return databasePool;
}

export async function assertNotEmployee(externalId) {
  const employee = await findEmployee(employeeDatabase(), externalId);
  // Inactive employee accounts must not fall back into client/admin privileges either.
  if (employee) throw new EmployeeError('employee_only', 'Use your Employee Dashboard to access your work.', 403);
}
