import React, { useState } from "react";
import styled from "styled-components";

interface DeepLinkExample {
  label: string;
  url: string;
}

interface DeepLinkGuide {
  title: string;
  description: string;
  examples: DeepLinkExample[];
  note?: string;
}

interface PageDescriptionProps {
  title: string;
  description: string;
  features?: string[];
  usage?: string[];
  deepLinkGuide?: DeepLinkGuide;
}

const DescriptionBox = styled.div`
  background-color: #f0f9ff;
  border: 1px solid #bae6fd;
  border-radius: 8px;
  margin-bottom: 24px;
  overflow: hidden;
`;

const DescriptionHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  cursor: pointer;
  user-select: none;
  transition: background-color 0.2s;

  &:hover {
    background-color: #e0f2fe;
  }
`;

const DescriptionTitle = styled.h3`
  font-size: 15px;
  font-weight: 700;
  color: #0369a1;
  margin: 0;
`;

const ToggleIcon = styled.span`
  font-size: 18px;
  color: #0369a1;
  transition: transform 0.2s;
  transform: ${(props: { $isOpen: boolean }) => 
    props.$isOpen ? 'rotate(180deg)' : 'rotate(0deg)'};
`;

const DescriptionContent = styled.div<{ $isOpen: boolean }>`
  max-height: ${(props) => (props.$isOpen ? '1000px' : '0')};
  overflow: hidden;
  transition: max-height 0.3s ease-out;
  padding: ${(props) => (props.$isOpen ? '0 16px 16px' : '0 16px')};
`;

const DescriptionText = styled.p`
  font-size: 14px;
  color: #0c4a6e;
  line-height: 1.6;
  margin: 12px 0;
`;

const FeatureList = styled.ul`
  margin: 0 0 12px;
  padding-left: 20px;
  font-size: 13px;
  color: #075985;
  line-height: 1.6;
`;

const FeatureItem = styled.li`
  margin-bottom: 4px;
`;

const UsageList = styled.ul`
  margin: 0;
  padding-left: 20px;
  font-size: 13px;
  color: #075985;
  line-height: 1.6;
`;

const UsageItem = styled.li`
  margin-bottom: 4px;
`;

const DeepLinkSection = styled.div`
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #bae6fd;
`;

const DeepLinkTitle = styled.h4`
  font-size: 14px;
  font-weight: 700;
  color: #0369a1;
  margin: 0 0 8px;
`;

const DeepLinkDescription = styled.p`
  font-size: 13px;
  color: #075985;
  line-height: 1.6;
  margin: 0 0 12px;
`;

const DeepLinkExamples = styled.div`
  background-color: #ffffff;
  border: 1px solid #e0f2fe;
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 8px;
`;

const DeepLinkExampleItem = styled.div`
  display: flex;
  align-items: center;
  margin-bottom: 8px;
  font-size: 13px;

  &:last-child {
    margin-bottom: 0;
  }
`;

const DeepLinkLabel = styled.span`
  color: #075985;
  font-weight: 600;
  min-width: 140px;
  margin-right: 8px;
`;

const DeepLinkUrl = styled.code`
  background-color: #f0f9ff;
  border: 1px solid #bae6fd;
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 12px;
  color: #0c4a6e;
  font-family: 'Courier New', monospace;
  flex: 1;
`;

const DeepLinkNote = styled.p`
  font-size: 12px;
  color: #64748b;
  line-height: 1.5;
  margin: 8px 0 0;
  font-style: italic;
`;

export default function PageDescription({
  title,
  description,
  features,
  usage,
  deepLinkGuide,
}: PageDescriptionProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <DescriptionBox>
      <DescriptionHeader onClick={() => setIsOpen(!isOpen)}>
        <DescriptionTitle>{title}</DescriptionTitle>
        <ToggleIcon $isOpen={isOpen}>▾</ToggleIcon>
      </DescriptionHeader>
      <DescriptionContent $isOpen={isOpen}>
        <DescriptionText>{description}</DescriptionText>
        {features && features.length > 0 && (
          <FeatureList>
            {features.map((feature, index) => (
              <FeatureItem key={index}>{feature}</FeatureItem>
            ))}
          </FeatureList>
        )}
        {usage && usage.length > 0 && (
          <UsageList>
            {usage.map((item, index) => (
              <UsageItem key={index}>{item}</UsageItem>
            ))}
          </UsageList>
        )}
        {deepLinkGuide && (
          <DeepLinkSection>
            <DeepLinkTitle>{deepLinkGuide.title}</DeepLinkTitle>
            <DeepLinkDescription>{deepLinkGuide.description}</DeepLinkDescription>
            <DeepLinkExamples>
              {deepLinkGuide.examples.map((example, index) => (
                <DeepLinkExampleItem key={index}>
                  <DeepLinkLabel>{example.label}:</DeepLinkLabel>
                  <DeepLinkUrl>{example.url}</DeepLinkUrl>
                </DeepLinkExampleItem>
              ))}
            </DeepLinkExamples>
            {deepLinkGuide.note && (
              <DeepLinkNote>{deepLinkGuide.note}</DeepLinkNote>
            )}
          </DeepLinkSection>
        )}
      </DescriptionContent>
    </DescriptionBox>
  );
}

