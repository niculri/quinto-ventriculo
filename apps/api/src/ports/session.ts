// The student a session token belongs to, and what verifies it.
export interface User {
  id: string;
  email: string;
}

export interface SessionVerifier {
  verify(token: string): Promise<User | null>;
}
