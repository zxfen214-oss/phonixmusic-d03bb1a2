
CREATE TABLE public.billboard (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  song_id UUID NOT NULL REFERENCES public.songs(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (song_id)
);

CREATE INDEX idx_billboard_position ON public.billboard (position);

ALTER TABLE public.billboard ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Billboard is viewable by everyone"
  ON public.billboard FOR SELECT
  USING (true);

CREATE POLICY "Admins insert billboard"
  ON public.billboard FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins update billboard"
  ON public.billboard FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins delete billboard"
  ON public.billboard FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER billboard_set_updated_at
  BEFORE UPDATE ON public.billboard
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
