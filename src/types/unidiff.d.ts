declare module 'diff' {
  export interface Change {
    value: string;
    added?: boolean;
    removed?: boolean;
  }

  export interface Options {
    context?: number;
    ignoreCase?: boolean;
  }

  export function diffLines(oldStr: string, newStr: string, options?: Options): Change[];
  export function createTwoFilesPatch(
    oldFileName: string,
    newFileName: string,
    oldStr: string,
    newStr: string,
    oldHeader?: string,
    newHeader?: string,
    options?: Options
  ): string;
}
