import { NodeEnv } from "@src/constants/node-env";

class Logger {
  public static COLOR_RESET = "\u001b[0m";
  // *: colors
  public static BLACK_COLOR = "\x1b[30m";
  public static RED_COLOR = "\x1b[31m";
  public static GREEN_COLOR = "\x1b[32m";
  public static YELLOW_COLOR = "\x1b[33m";
  public static BLUE_COLOR = "\x1b[34m";
  public static MAGENTA_COLOR = "\x1b[35m";
  public static CYAN_COLOR = "\x1b[36m";
  public static WHITE_COLOR = "\x1b[37m";
  // *: background colors
  public static BLACK_BACKGROUND_COLOR = "\x1b[40m";
  public static RED_BACKGROUND_COLOR = "\x1b[41m";
  public static GREEN_BACKGROUND_COLOR = "\x1b[42m";
  public static YELLOW_BACKGROUND_COLOR = "\x1b[43m";
  public static BLUE_BACKGROUND_COLOR = "\x1b[44m";
  public static MAGENTA_BACKGROUND_COLOR = "\x1b[45m";
  public static CYAN_BACKGROUND_COLOR = "\x1b[46m";
  public static WHITE_BACKGROUND_COLOR = "\x1b[47m";

  public black = Logger.coloredLog(Logger.BLACK_COLOR);
  public red = Logger.coloredLog(Logger.RED_COLOR);
  public green = Logger.coloredLog(Logger.GREEN_COLOR);
  public yellow = Logger.coloredLog(Logger.YELLOW_COLOR);
  public blue = Logger.coloredLog(Logger.BLUE_COLOR);
  public magenta = Logger.coloredLog(Logger.MAGENTA_COLOR);
  public cyan = Logger.coloredLog(Logger.CYAN_COLOR);
  public white = Logger.coloredLog(Logger.WHITE_COLOR);

  constructor(private logEnabled: boolean) {}

  private static coloredLog(color: string) {
    return function (...[message, ...params]: Parameters<typeof console.log>) {
      const hasParams = params.length > 0;

      if (hasParams) {
        params.push(Logger.COLOR_RESET);
      }

      if (this.logEnabled) {
        console.log(
          `${color}${message || ""}${hasParams ? "" : Logger.COLOR_RESET}`,
          ...params,
        );
      }
    };
  }
}

export const devLog = new Logger(process.env.NODE_ENV === NodeEnv.DEV);
export const prodLog = new Logger(
  process.env.NODE_ENV === NodeEnv.DEV || process.env.NODE_ENV === NodeEnv.PROD,
);
export default Logger;
