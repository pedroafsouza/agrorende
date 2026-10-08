import { RotateCcw } from "lucide-react-native";

import { EmptyState } from "../EmptyState";
import { Header } from "../Header";
import { ListItem } from "../ListItem";
import { Button } from "../Button";

export interface DeletedItem {
  readonly id: string;
  readonly title: string;
  readonly deletedAtLabel: string;
}

export type RecentlyDeletedProps = { readonly items: readonly DeletedItem[]; readonly onRestore: (id: string) => void };

/** Local soft-deleted items that can still be restored (REC-04). */
export function RecentlyDeleted({ items, onRestore }: RecentlyDeletedProps) {
  return (
    <>
      <Header titleKey="ui.recovery.recentlyDeleted" />
      {items.length === 0 ? (
        <EmptyState titleKey="ui.recovery.recentlyDeletedEmpty" bodyKey="ui.recovery.recentlyDeletedHint" />
      ) : (
        items.map((item) => (
          <ListItem key={item.id} title={item.title} subtitle={item.deletedAtLabel} right={<Button compact variant="secondary" icon={RotateCcw} labelKey="ui.recovery.restore" onPress={() => onRestore(item.id)} />} />
        ))
      )}
    </>
  );
}
