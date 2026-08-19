import { Image, StyleSheet } from "react-native";
import { colors } from "../theme/colors";

const looperAppIcon = require("../../../assets/app-icon.png");

export function LooperBrand({ size = 28 }: { size?: number }) {
  return (
    <Image
      accessibilityLabel="Looper"
      accessibilityRole="image"
      source={looperAppIcon}
      style={[styles.icon, { borderRadius: size * 0.22, height: size, width: size }]}
    />
  );
}

const styles = StyleSheet.create({
  icon: { backgroundColor: colors.brandPaper },
});
