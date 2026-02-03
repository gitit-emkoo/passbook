import React, { useState } from "react";
import styled from "styled-components";

interface PageDescriptionProps {
  title: string;
  description: string;
  features?: string[];
  usage?: string[];
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

export default function PageDescription({
  title,
  description,
  features,
  usage,
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
      </DescriptionContent>
    </DescriptionBox>
  );
}

