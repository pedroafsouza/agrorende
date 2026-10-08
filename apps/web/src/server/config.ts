const APP_ENVS = ["local", "ci", "staging", "production"] as const;
export type AppEnv = (typeof APP_ENVS)[number];

function readAppEnv(value: string | undefined): AppEnv {
  if (value === undefined || value.length === 0) {
    return "local";
  }

  const appEnv = APP_ENVS.find((candidate) => candidate === value);
  if (appEnv === undefined) {
    throw new Error("APP_ENV must be local, ci, staging or production");
  }

  return appEnv;
}

export const serverConfig = {
  appEnv: readAppEnv(process.env.APP_ENV),
} as const;
