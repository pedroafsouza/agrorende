import { Image } from "expo-image";
import { FileAudio, Trash2, Video } from "lucide-react-native";
import { ScrollView, StyleSheet, View } from "react-native";

import { Icon, IconButton, Text, useTheme } from "../../ui";
import type { MediaDraft } from "./drafts";

export type ThumbnailsProps = { readonly drafts: readonly MediaDraft[]; readonly onDelete?: (id: string) => void };

/** Horizontal strip of captured media with a labelled delete button per item. */
export function Thumbnails({ drafts, onDelete }: ThumbnailsProps) {
  const theme = useTheme();
  if (drafts.length === 0) return null;
  return (
    <ScrollView horizontal testID="media-thumbnails" contentContainerStyle={styles.strip}>
      {drafts.map((draft) => (
        <View key={draft.id} testID={`media-thumb-${draft.id}`} style={[styles.item, { borderColor: theme.border }]}>
          {draft.kind === "PHOTO" || draft.kind === "SIGNATURE" ? (
            <Image source={{ uri: draft.thumbUri ?? draft.localUri }} style={styles.image} contentFit="cover" />
          ) : (
            <View style={[styles.image, styles.placeholder, { backgroundColor: theme.surface }]}>
              <Icon icon={draft.kind === "VIDEO" ? Video : FileAudio} size={32} color={theme.textSecondary} />
            </View>
          )}
          <Text i18nKey={`media.tag.${draft.tag}`} variant="caption" numberOfLines={1} />
          {onDelete === undefined ? null : <IconButton testID={`media-delete-${draft.id}`} icon={Trash2} labelKey="ui.action.delete" onPress={() => onDelete(draft.id)} />}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  image: { borderRadius: 8, height: 88, width: 88 },
  item: { alignItems: "center", borderRadius: 12, borderWidth: 1, gap: 4, padding: 6, width: 104 },
  placeholder: { alignItems: "center", justifyContent: "center" },
  strip: { gap: 8, paddingVertical: 4 },
});
