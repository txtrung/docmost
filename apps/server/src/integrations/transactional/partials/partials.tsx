import { button as buttonStyle, container, footer, h1, logo, main } from '../css/styles';
import {
  Body,
  Container,
  Head,
  Html,
  Img,
  Row,
  Section,
  Text,
} from 'react-email';
import * as React from 'react';
import { BRAND_EMAIL_LOGO_SRC, BRAND_NAME } from '../../../common/brand';

interface MailBodyProps {
  children: React.ReactNode;
}

export function MailBody({ children }: MailBodyProps) {
  return (
    <Html>
      <Head />
      <Body style={main}>
        <MailHeader />
        <Container style={container}>{children}</Container>
        <MailFooter />
      </Body>
    </Html>
  );
}

export function MailHeader() {
  return (
    <Section style={{ ...logo, textAlign: 'center' as const }}>
      <Img
        src={BRAND_EMAIL_LOGO_SRC}
        width="32"
        height="32"
        alt={BRAND_NAME}
        style={{ margin: '8px auto' }}
      />
      <Text style={{ ...h1, textAlign: 'center' as const, margin: '0 0 8px' }}>
        {BRAND_NAME}
      </Text>
    </Section>
  );
}

interface EmailButtonProps {
  href: string;
  children: React.ReactNode;
}

export function EmailButton({ href, children }: EmailButtonProps) {
  return (
    <table
      role="presentation"
      cellPadding="0"
      cellSpacing="0"
      style={{ margin: '0 0 15px 15px' }}
    >
      <tr>
        <td
          style={{
            backgroundColor: buttonStyle.backgroundColor,
            borderRadius: buttonStyle.borderRadius,
            textAlign: 'center' as const,
          }}
        >
          <a
            href={href}
            target="_blank"
            style={{
              color: buttonStyle.color,
              fontFamily: buttonStyle.fontFamily,
              fontSize: buttonStyle.fontSize,
              textDecoration: 'none',
              display: 'inline-block',
              padding: '8px 16px',
            }}
          >
            {children}
          </a>
        </td>
      </tr>
    </table>
  );
}

export function MailFooter() {
  return (
    <Section style={footer}>
      <Row>
        <Text style={{ textAlign: 'center', color: '#706a7b' }}>
          © {new Date().getFullYear()} {BRAND_NAME}, All Rights Reserved <br />
        </Text>
      </Row>
    </Section>
  );
}

export function getGreetingName(name?: string): string {
  return name?.split(' ')[0] || 'there';
}
