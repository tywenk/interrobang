import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useState, type FormEvent } from 'react';

import { useEditorStore } from '../stores/editor-store';
import { useProjectStore } from '../stores/project-store';

export function AddGlyphDialog() {
  const projectId = useEditorStore((s) => s.addGlyphPromptProjectId);
  const close = useEditorStore((s) => s.closeAddGlyphPrompt);
  const [value, setValue] = useState('');

  const open = projectId !== null;

  function onOpenChange(next: boolean) {
    if (!next) {
      close();
      setValue('');
    }
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!projectId) return;
    const char = value.trim();
    if (!char) return;
    useProjectStore.getState().addGlyph(projectId, char);
    close();
    setValue('');
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={onSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Add glyph</DialogTitle>
            <DialogDescription>
              Enter the character for the new glyph. Use a single character or a short name.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="add-glyph-character">Character</Label>
            <Input
              id="add-glyph-character"
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="e.g. A"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!value.trim()}>
              Add
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
