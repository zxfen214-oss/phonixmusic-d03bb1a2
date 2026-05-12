import { createContext, useContext, useState, ReactNode, useCallback } from "react";

interface ViewContextType {
  selectedAlbum: string | null;
  selectedPlaylistId: string | null;
  openAlbum: (album: string) => void;
  openPlaylist: (id: string) => void;
  closeDetail: () => void;
}

const ViewContext = createContext<ViewContextType | undefined>(undefined);

export function ViewProvider({ children }: { children: ReactNode }) {
  const [selectedAlbum, setSelectedAlbum] = useState<string | null>(null);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);

  const openAlbum = useCallback((album: string) => {
    setSelectedPlaylistId(null);
    setSelectedAlbum(album);
  }, []);
  const openPlaylist = useCallback((id: string) => {
    setSelectedAlbum(null);
    setSelectedPlaylistId(id);
  }, []);
  const closeDetail = useCallback(() => {
    setSelectedAlbum(null);
    setSelectedPlaylistId(null);
  }, []);

  return (
    <ViewContext.Provider value={{ selectedAlbum, selectedPlaylistId, openAlbum, openPlaylist, closeDetail }}>
      {children}
    </ViewContext.Provider>
  );
}

export function useView() {
  const ctx = useContext(ViewContext);
  if (!ctx) throw new Error("useView must be used within a ViewProvider");
  return ctx;
}
