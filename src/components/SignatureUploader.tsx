
'use client';

import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Upload, X, CheckCircle2 } from 'lucide-react';
import Image from 'next/image';

interface SignatureUploaderProps {
  onSignatureUpload: (dataUrl: string | null) => void;
}

export function SignatureUploader({ onSignatureUpload }: SignatureUploaderProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        setPreview(result);
        onSignatureUpload(result);
      };
      reader.readAsDataURL(file);
    }
  };

  const clearSignature = () => {
    setPreview(null);
    onSignatureUpload(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <Card className="w-full border-dashed border-2 bg-white/50 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-xl flex items-center gap-2">
          <Upload className="w-5 h-5 text-primary" />
          Step 1: Your Signature
        </CardTitle>
        <CardDescription>
          Upload a transparent PNG of your handwritten signature.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!preview ? (
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center justify-center py-8 border-2 border-dashed rounded-lg cursor-pointer hover:bg-accent/10 transition-colors bg-white/30"
          >
            <Upload className="w-10 h-10 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">Click or drag & drop signature image</p>
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept="image/*" 
              onChange={handleFileChange} 
            />
          </div>
        ) : (
          <div className="relative group">
            <div className="flex flex-col items-center justify-center p-4 border rounded-lg bg-white shadow-sm">
              <div className="relative w-full h-32 mb-2">
                <Image 
                  src={preview} 
                  alt="Signature Preview" 
                  fill 
                  className="object-contain"
                />
              </div>
              <div className="flex items-center gap-2 text-green-600 font-medium text-sm">
                <CheckCircle2 className="w-4 h-4" />
                Signature ready
              </div>
            </div>
            <Button 
              variant="destructive" 
              size="icon" 
              className="absolute -top-2 -right-2 h-6 w-6 rounded-full shadow-lg"
              onClick={clearSignature}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
