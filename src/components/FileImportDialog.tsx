import { useRef, useState } from 'react';
import { importMultipleFiles, getSupportedFormats } from '@/lib/fileImport';
import { useLibrary } from '@/contexts/LibraryContext';
import { Upload, FileAudio, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface FileImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function FileImportDialog({ isOpen, onClose }: FileImportDialogProps) {
  const [isImporting, setIsImporting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { addTracks } = useLibrary();
  const { toast } = useToast();

  const handleFiles = async (files: FileList) => {
    if (files.length === 0) return;

    setIsImporting(true);
    try {
      const tracks = await importMultipleFiles(files);
      
      if (tracks.length > 0) {
        await addTracks(tracks);
        toast({
          title: 'Import complete',
          description: `Added ${tracks.length} track${tracks.length > 1 ? 's' : ''} to your library`,
        });
        onClose();
      } else {
        toast({
          title: 'No tracks imported',
          description: 'No supported audio files were found',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Import failed',
        description: 'There was an error importing your files',
        variant: 'destructive',
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFiles(e.target.files);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px] bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">Import Local Files</DialogTitle>
        </DialogHeader>

        <div
          className={`
            relative border-2 border-dashed rounded-xl p-12 text-center transition-all cursor-pointer
            ${isDragging 
              ? 'border-accent bg-accent/10' 
              : 'border-border hover:border-muted-foreground/50'
            }
          `}
          onClick={() => fileInputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={getSupportedFormats()}
            multiple
            onChange={handleFileInput}
            className="hidden"
          />

          {isImporting ? (
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-12 w-12 text-accent animate-spin" />
              <p className="text-lg font-medium">Importing files...</p>
              <p className="text-sm text-muted-foreground">
                Reading metadata and adding to library
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <div className="p-4 rounded-full bg-secondary">
                {isDragging ? (
                  <Upload className="h-10 w-10 text-accent" />
                ) : (
                  <FileAudio className="h-10 w-10 text-muted-foreground" />
                )}
              </div>
              <div>
                <p className="text-lg font-medium">
                  {isDragging ? 'Drop files here' : 'Drop files or click to browse'}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Supports MP3, WAV, OGG, and MP4 files
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="text-xs text-muted-foreground text-center">
          Metadata will be automatically extracted from file tags
        </div>
      </DialogContent>
    </Dialog>
  );
}
