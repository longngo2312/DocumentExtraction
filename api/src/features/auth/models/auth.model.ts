//shape of a row from users table in the admin DB
export interface User {
  id: number;
  username: string;
  password_hash: string;
  email: string;
  tenant_db_path: string;
  created_at: string;
  last_login_at: string | null;
}
