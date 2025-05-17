import NextAuth, { DefaultSession, DefaultUser } from "next-auth"
import { JWT, DefaultJWT } from "next-auth/jwt"

declare module "next-auth" {
  /**
   * Extend the built-in session types
   */
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"]
  }

  /**
   * Extend the built-in user types
   */
  interface User extends DefaultUser {
    // Add any custom fields from your User model if needed
    name: string;
    email: string;
  }
}

declare module "next-auth/jwt" {
  /**
   * Extend the built-in JWT types
   */
  interface JWT extends DefaultJWT {
    id: string;
    // name and email are already included in DefaultJWT
  }
}
