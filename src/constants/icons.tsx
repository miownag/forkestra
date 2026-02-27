import { Claude, OpenAI, Kimi, Qwen, Cline, Alibaba } from "@lobehub/icons";
import { Gemini } from "@lobehub/icons";

// Import seti icons from public/seti
import TypeScript from "../../public/seti/typescript.svg";
import JavaScript from "../../public/seti/javascript.svg";
import CSS from "../../public/seti/css.svg";
import HTML from "../../public/seti/html.svg";
import JSON from "../../public/seti/json.svg";
import Markdown from "../../public/seti/markdown.svg";
import C from "../../public/seti/c.svg";
import Cpp from "../../public/seti/cpp.svg";
import CSharp from "../../public/seti/c-sharp.svg";
import EJS from "../../public/seti/ejs.svg";
import Go from "../../public/seti/go.svg";
import Haskell from "../../public/seti/haskell.svg";
import Java from "../../public/seti/java.svg";
import Kotlin from "../../public/seti/kotlin.svg";
import Dart from "../../public/seti/dart.svg";
import LESS from "../../public/seti/less.svg";
import Lua from "../../public/seti/lua.svg";
import Maven from "../../public/seti/maven.svg";
import Perl from "../../public/seti/perl.svg";
import PHP from "../../public/seti/php.svg";
import Python from "../../public/seti/python.svg";
import React from "../../public/seti/react.svg";
import R from "../../public/seti/R.svg";
import Ruby from "../../public/seti/ruby.svg";
import Rust from "../../public/seti/rust.svg";
import SASS from "../../public/seti/sass.svg";
import Scala from "../../public/seti/scala.svg";
import Stylus from "../../public/seti/stylus.svg";
import Swift from "../../public/seti/swift.svg";
import DB from "../../public/seti/db.svg";
import Vue from "../../public/seti/vue.svg";
import WASM from "../../public/seti/wasm.svg";
import PDF from "../../public/seti/pdf.svg";
import Image from "../../public/seti/image.svg";
import SVG from "../../public/seti/svg.svg";
import Shell from "../../public/seti/shell.svg";
import Lock from "../../public/seti/lock.svg";
import Zig from "../../public/seti/zig.svg";

const PROVIDER_ICONS_MAP = {
  claude: Claude,
  gemini: Gemini,
  kimi: Kimi,
  codex: OpenAI,
  open_code: Cline,
  qoder: Alibaba,
  qwen_code: Qwen,
} as const;

type ProviderIconMap = typeof PROVIDER_ICONS_MAP;
type ProviderIconType = ProviderIconMap[keyof ProviderIconMap];

/**
 * Render a provider icon's Color variant if available, otherwise fall back to Avatar.
 * This is needed because some icons (e.g. OpenAI) don't have a Color sub-component.
 */
function ProviderColorIcon({
  icon,
  size,
}: {
  icon: ProviderIconType;
  size: number;
}) {
  if ("Color" in icon && icon.Color) {
    const ColorComponent = icon.Color as React.ComponentType<{ size: number }>;
    return <ColorComponent size={size} />;
  }
  return <icon.Avatar size={size} />;
}

/**
 * Render a provider icon's Combine variant if available, otherwise fall back
 * to Color or Avatar. Some icons (e.g. Alibaba) don't expose Combine.
 */
function ProviderCombineIcon({
  icon,
  size,
  className,
  type,
}: {
  icon: ProviderIconType;
  size: number;
  className?: string;
  type?: string;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const iconAny = icon as any;
  if ("Combine" in icon && iconAny.Combine) {
    const CombineComponent = iconAny.Combine as React.ComponentType<{
      size: number;
      className?: string;
      type?: string;
    }>;
    return <CombineComponent size={size} className={className} type={type} />;
  }
  // Fallback: try Color, then Avatar
  if ("Color" in icon && iconAny.Color) {
    const ColorComponent = iconAny.Color as React.ComponentType<{
      size: number;
      className?: string;
    }>;
    return <ColorComponent size={size} className={className} />;
  }
  return <icon.Avatar size={size} />;
}

const FILE_EXT_SETI_ICONS_MAP = {
  ts: TypeScript,
  tsx: React,
  js: JavaScript,
  jsx: React,
  css: CSS,
  scss: SASS,
  sass: SASS,
  html: HTML,
  htm: HTML,
  json: JSON,
  md: Markdown,
  mdx: Markdown,
  c: C,
  cpp: Cpp,
  h: C,
  hpp: Cpp,
  cs: CSharp,
  ejs: EJS,
  go: Go,
  hs: Haskell,
  java: Java,
  kt: Kotlin,
  kts: Kotlin,
  dart: Dart,
  less: LESS,
  lua: Lua,
  maven: Maven,
  pl: Perl,
  php: PHP,
  py: Python,
  pyw: Python,
  r: R,
  rb: Ruby,
  rs: Rust,
  scala: Scala,
  sc: Scala,
  styl: Stylus,
  swift: Swift,
  db: DB,
  sql: DB,
  vue: Vue,
  wasm: WASM,
  wat: WASM,
  pdf: PDF,
  png: Image,
  jpg: Image,
  jpeg: Image,
  gif: Image,
  webp: Image,
  bmp: Image,
  ico: Image,
  svg: SVG,
  sh: Shell,
  bash: Shell,
  zsh: Shell,
  zig: Zig,
  lock: Lock,
};

const MD_LANG_TYPE_SETI_ICONS_MAP = {
  typescript: TypeScript,
  tsx: React,
  javascript: JavaScript,
  jsx: React,
  css: CSS,
  scss: SASS,
  sass: SASS,
  html: HTML,
  json: JSON,
  markdown: Markdown,
  md: Markdown,
  c: C,
  cpp: Cpp,
  "c++": Cpp,
  csharp: CSharp,
  "c#": CSharp,
  ejs: EJS,
  go: Go,
  golang: Go,
  haskell: Haskell,
  hs: Haskell,
  java: Java,
  kotlin: Kotlin,
  dart: Dart,
  less: LESS,
  lua: Lua,
  perl: Perl,
  php: PHP,
  python: Python,
  py: Python,
  r: R,
  ruby: Ruby,
  rb: Ruby,
  rust: Rust,
  rs: Rust,
  scala: Scala,
  stylus: Stylus,
  swift: Swift,
  sql: DB,
  vue: Vue,
  wasm: WASM,
  shell: Shell,
  bash: Shell,
  zsh: Shell,
  sh: Shell,
};

export {
  PROVIDER_ICONS_MAP,
  ProviderColorIcon,
  ProviderCombineIcon,
  FILE_EXT_SETI_ICONS_MAP,
  MD_LANG_TYPE_SETI_ICONS_MAP,
};
