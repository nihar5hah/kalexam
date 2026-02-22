"use client";

import { AnimatePresence, motion } from "framer-motion";
import { FileText, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";

type FileUploadGroupProps = {
  title: string;
  helperText: string;
  files: File[];
  required?: boolean;
  onFilesAdd: (files: File[]) => void;
  onFileRemove: (index: number) => void;
};

export function FileUploadGroup({
  title,
  helperText,
  files,
  required,
  onFilesAdd,
  onFileRemove,
}: FileUploadGroupProps) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <label className="text-sm text-neutral-300 font-medium">
          {title} {required ? <span className="text-red-300">*</span> : null}
        </label>
        <p className="text-xs text-neutral-500">{helperText}</p>
      </div>

      <input
        type="file"
        multiple
        accept=".pdf,.docx,.ppt,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation"
        onChange={(event) => {
          const selected = Array.from(event.target.files ?? []);
          if (selected.length) {
            onFilesAdd(selected);
          }
          event.currentTarget.value = "";
        }}
        className="w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-3 text-sm text-neutral-300 file:mr-3 file:rounded-xl file:border-0 file:bg-white/10 file:px-3 file:py-1 file:text-xs file:text-white"
      />

      <AnimatePresence initial={false}>
        {files.length ? (
          <motion.ul
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="space-y-2"
          >
            {files.map((file, index) => (
              <motion.li
                key={`${file.name}-${file.size}-${index}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.2 }}
                className="flex items-center justify-between rounded-xl border border-white/10 bg-black/25 px-3 py-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="w-4 h-4 text-neutral-400 shrink-0" />
                  <span className="text-xs text-neutral-200 truncate">{file.name}</span>
                </div>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  onClick={() => onFileRemove(index)}
                  className="text-neutral-400 hover:text-red-300"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </motion.li>
            ))}
          </motion.ul>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
