/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** A bare https origin (for example https://api.example.test) when the build talks to a sign-in server; unset for the practice build. */
  readonly VITE_GOALLINE_API_ORIGIN?: string;
}
