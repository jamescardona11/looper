import Svg, { Path } from "react-native-svg";
import { colors } from "../theme/colors";
import { ICON_PATHS, type IconName } from "./icon-paths";

type IconProps = {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
};

export function Icon({
  name,
  size = 20,
  color = colors.textSecondary,
  strokeWidth = 2,
}: IconProps) {
  return (
    <Svg fill="none" height={size} viewBox="0 0 24 24" width={size}>
      {ICON_PATHS[name].map((d) => (
        <Path
          d={d}
          key={d}
          stroke={color}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={strokeWidth}
        />
      ))}
    </Svg>
  );
}

export { ICON_PATHS, type IconName };
