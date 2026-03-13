
'use client';

import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Check, X, Download, Loader2, Eye } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { detectSignaturePlacement } from '@/ai/flows/detect-signature-placement';
import { extractPdfText, signPdf } from '@/lib/pdf-service';
import { useToast } from '@/hooks/use-toast';

interface DocumentCardProps {
  file: File;
  signatureImage: string | null;
  onRemove: () => void;
  onPreview: () => void;
}

export function DocumentCard({ file, signatureImage, onRemove, onPreview }: DocumentCardProps) {
  const [status, setStatus] = useState<'pending' | 'signing' | 'signed' | 'rejected'>('pending');
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const { toast } = useToast();

  const handleSign = async () => {
    if (!signatureImage) {
      toast({
        title: "Signature Required",
        description: "Please upload your digital signature first.",
        variant: "destructive"
      });
      return;
    }

    setStatus('signing');
    try {
      const text = await extractPdfText(file);
      const detection = await detectSignaturePlacement({ pdfText: text });
      
      const signedBytes = await signPdf(
        file, 
        signatureImage, 
        detection.detectedPlacementText || "Signature"
      );
      
      const blob = new Blob([signedBytes], { type: 'application/pdf' });
      setSignedUrl(URL.createObjectURL(blob));
      setStatus('signed');
      
      toast({
        title: "Signed Successfully",
        description: detection.detectedPlacementText 
          ? `Detected placement near: ${detection.detectedPlacementText}`
          : "Document signed successfully.",
      });
    } catch (error) {
      console.error(error);
      setStatus('pending');
      toast({
        title: "Error Signing",
        description: "There was an issue processing the PDF document.",
        variant: "destructive"
      });
    }
  };

  const handleDownload = () => {
    if (signedUrl) {
      const link = document.createElement('a');
      link.href = signedUrl;
      link.download = `signed_${file.name}`;
      link.click();
    }
  };

  return (
    <Card className="overflow-hidden bg-white/80 transition-all hover:shadow-md border-border/50">
      <CardContent className="p-4 flex items-center gap-4">
        <div className="bg-primary/10 p-3 rounded-lg">
          <FileText className="w-6 h-6 text-primary" />
        </div>
        
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{file.name}</p>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant={
              status === 'signed' ? 'default' : 
              status === 'rejected' ? 'destructive' : 
              status === 'signing' ? 'secondary' : 'outline'
            } className="text-[10px] px-1.5 py-0 uppercase">
              {status}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {(file.size / 1024).toFixed(1)} KB
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={onPreview} title="Preview">
            <Eye className="w-4 h-4" />
          </Button>

          {status === 'pending' && (
            <>
              <Button 
                variant="outline" 
                size="sm" 
                className="bg-accent/10 hover:bg-accent/20 text-accent-foreground border-accent/20"
                onClick={handleSign}
              >
                Sign
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setStatus('rejected')}>
                <X className="w-4 h-4 text-destructive" />
              </Button>
            </>
          )}

          {status === 'signing' && (
            <Button disabled variant="outline" size="sm">
              <Loader2 className="w-3 h-3 animate-spin mr-2" />
              AI...
            </Button>
          )}

          {status === 'signed' && (
            <Button variant="default" size="sm" onClick={handleDownload} className="bg-green-600 hover:bg-green-700">
              <Download className="w-4 h-4 mr-1" />
              Save
            </Button>
          )}

          {status === 'rejected' && (
            <Button variant="ghost" size="sm" onClick={() => setStatus('pending')}>
              Reset
            </Button>
          )}
          
          <Button variant="ghost" size="icon" onClick={onRemove} className="text-muted-foreground hover:text-destructive">
            <X className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
