
'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { getMsalInstance, loginRequest } from '@/lib/msal-config';
import { Client } from '@microsoft/microsoft-graph-client';
import { Cloud, Loader2, Share2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface MicrosoftSyncProps {
  onFilesReceived: (files: File[]) => void;
}

export function MicrosoftSync({ onFilesReceived }: MicrosoftSyncProps) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSync = async () => {
    setLoading(true);
    try {
      const msal = await getMsalInstance();
      const loginResponse = await msal.loginPopup(loginRequest);
      
      const graphClient = Client.init({
        authProvider: (done) => {
          done(null, loginResponse.accessToken);
        },
      });

      // Fetch recent files or files from a specific location
      // This example fetches the user's recent files that are PDFs
      const result = await graphClient
        .api('/me/drive/recent')
        .filter("file ne null")
        .get();

      const pdfs = result.value.filter((item: any) => item.name.toLowerCase().endsWith('.pdf')).slice(0, 5);

      if (pdfs.length === 0) {
        toast({
          title: "No PDFs found",
          description: "We couldn't find any recent PDF documents in your OneDrive/SharePoint.",
        });
        return;
      }

      const files: File[] = await Promise.all(
        pdfs.map(async (item: any) => {
          const content = await graphClient.api(`/me/drive/items/${item.id}/content`).get();
          return new File([content], item.name, { type: 'application/pdf' });
        })
      );

      onFilesReceived(files);
      toast({
        title: "Sync Complete",
        description: `Imported ${files.length} documents from Microsoft 365.`,
      });
    } catch (error: any) {
      console.error(error);
      toast({
        title: "Microsoft 365 Error",
        description: error.message || "Failed to connect to Microsoft 365.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button 
      variant="outline" 
      onClick={handleSync} 
      disabled={loading}
      className="rounded-full gap-2 border-primary/20 hover:bg-primary/5"
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <Share2 className="w-4 h-4 text-[#0078d4]" />
      )}
      Sync SharePoint
    </Button>
  );
}
