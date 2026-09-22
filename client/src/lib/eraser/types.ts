export type PaletteToken =
  | "white"
  | "yellow"
  | "green"
  | "blue"
  | "purple"
  | "red"
  | "orange"
  | "black";

export type AllowedShape =
  | "rectangle"
  | "diamond"
  | "cylinder"
  | "parallelogram"
  | "trapezoid"
  | "hexagon"
  | "circle"
  | "ellipse"
  | "oval"
  | "triangle"
  | "star"
  | "document";

export type EntityTag =
  | "Shape"
  | "Group"
  | "Icon"
  | "Textbox"
  | "Activity"
  | "Event"
  | "Gateway"
  | "DatabaseTable"
  | "Lane"
  | "Pool"
  | "Divider"
  | "Legend";

export type StyleMode = "plain" | "shadow" | "watercolor";
export type BorderStyle = "solid" | "dashed" | "dotted";
export type Arrowhead = "triangle" | "arrow" | "bar" | "dot" | "crowFootSingle" | "crowFootMany" | "none";
export type CornerStyle = "straight" | "elbow";
export type ConnectorStyle = "elbow" | "curved" | "straight";

export interface MarkdownText {
  text: string;
  fontSize?: number;
  color?: string;
  typeface?: "rough" | "clean" | "mono";
  hAlign?: "left" | "center" | "right";
}

export interface EraserBadge {
  text?: string;
  icon?: string;
  shape?: "circle" | "rectangle";
  placement?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  color?: string;
  bgColor?: string;
}

export interface EraserGroupTitle {
  text: string;
  icon?: string;
  color?: string;
  bgColor?: string;
  width?: "snug" | "full" | "none";
  border?: boolean;
  fontSize?: number;
  hAlign?: "left" | "center" | "right";
}

export interface DatabaseField {
  name: string;
  type: string;
  meta?: string;
}

export interface EraserEntity {
  id: string;
  tag: EntityTag;
  shape?: AllowedShape;
  x: number;
  y: number;
  width?: number;
  height?: number;
  color?: PaletteToken | string;
  bgColor?: string;
  borderColor?: string;
  borderStyle?: BorderStyle;
  borderWidth?: number;
  styleMode?: StyleMode;
  texts?: MarkdownText[];
  icon?: string;
  iconProps?: {
    color?: string;
    size?: "sm" | "md" | "lg" | "xl";
  };
  containerId?: string | null;
  isContainer?: boolean;
  title?: EraserGroupTitle | string;
  badge?: EraserBadge;
  fields?: DatabaseField[];
  vAlign?: "top" | "middle" | "bottom";
  fontSize?: number;
}

export interface EraserConnection {
  id?: string;
  from: string;
  to: string;
  label?: string;
  lineStyle?: BorderStyle;
  lineWidth?: number;
  color?: PaletteToken | string;
  endArrowhead?: Arrowhead;
  startArrowhead?: Arrowhead;
  cornerStyle?: CornerStyle;
  connectorStyle?: ConnectorStyle;
  points?: Array<{ x: number; y: number }>;
}

export interface EraserDocument {
  title?: string;
  description?: string;
  entities: EraserEntity[];
  connections: EraserConnection[];
}
