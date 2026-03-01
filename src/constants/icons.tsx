import { Claude, OpenAI, Kimi, Qwen, Cline, Alibaba } from "@lobehub/icons";
import { Gemini } from "@lobehub/icons";

import TypeScript from "@/assets/seti/typescript.svg";
import JavaScript from "@/assets/seti/javascript.svg";
import CSS from "@/assets/seti/css.svg";
import HTML from "@/assets/seti/html.svg";
import JSON from "@/assets/seti/json.svg";
import Markdown from "@/assets/seti/markdown.svg";
import C from "@/assets/seti/c.svg";
import Cpp from "@/assets/seti/cpp.svg";
import CSharp from "@/assets/seti/c-sharp.svg";
import EJS from "@/assets/seti/ejs.svg";
import Go from "@/assets/seti/go.svg";
import Haskell from "@/assets/seti/haskell.svg";
import Java from "@/assets/seti/java.svg";
import Kotlin from "@/assets/seti/kotlin.svg";
import Dart from "@/assets/seti/dart.svg";
import LESS from "@/assets/seti/less.svg";
import Lua from "@/assets/seti/lua.svg";
import Maven from "@/assets/seti/maven.svg";
import Perl from "@/assets/seti/perl.svg";
import PHP from "@/assets/seti/php.svg";
import Python from "@/assets/seti/python.svg";
import React from "@/assets/seti/react.svg";
import R from "@/assets/seti/R.svg";
import Ruby from "@/assets/seti/ruby.svg";
import Rust from "@/assets/seti/rust.svg";
import SASS from "@/assets/seti/sass.svg";
import Scala from "@/assets/seti/scala.svg";
import Stylus from "@/assets/seti/stylus.svg";
import Swift from "@/assets/seti/swift.svg";
import DB from "@/assets/seti/db.svg";
import Vue from "@/assets/seti/vue.svg";
import WASM from "@/assets/seti/wasm.svg";
import PDF from "@/assets/seti/pdf.svg";
import Image from "@/assets/seti/image.svg";
import SVG from "@/assets/seti/svg.svg";
import Shell from "@/assets/seti/shell.svg";
import Lock from "@/assets/seti/lock.svg";
import Zig from "@/assets/seti/zig.svg";

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
