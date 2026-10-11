import { Children, cloneElement, isValidElement, type ReactNode } from "react";
import { Pressable, StyleSheet, View, type ViewProps } from "react-native";

import { ListItem, type ListItemProps } from "./ListItem";
import { radius, space, useTheme } from "./theme";

export type CardProps = ViewProps & { readonly onPress?: () => void; readonly accessibilityLabel?: string };

/**
 * Rows inside a card only draw a divider when another row follows, so the last row never
 * draws a second line against the card border.
 */
function withRowDividers(children: ReactNode): ReactNode {
  const items = Children.toArray(children);
  return items.map((child, index) => {
    if (!isValidElement<ListItemProps>(child) || child.type !== ListItem || child.props.divider !== undefined) return child;
    const next = items[index + 1];
    const followedByRow = isValidElement(next) && next.type === ListItem;
    return followedByRow ? child : cloneElement(child, { divider: false });
  });
}

export function Card({ children, style, onPress, ...props }: CardProps) {
  const theme = useTheme();
  const look = [styles.card, { backgroundColor: theme.surfaceRaised, borderColor: theme.border, borderWidth: theme.borderWidth }, style];
  const content = withRowDividers(children);
  if (onPress === undefined) {
    return (
      <View {...props} style={look}>
        {content}
      </View>
    );
  }
  return (
    <Pressable accessibilityRole="button" onPress={onPress} {...props} style={({ pressed }) => [look, pressed && styles.pressed]}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({ card: { borderRadius: radius.cards, gap: space[2], padding: space[4] }, pressed: { opacity: 0.85 } });
